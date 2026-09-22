#!/usr/bin/env bash
# Smoke the live API on feat/serializacion-api.
# Public catalog, registration, login, envelopes, and the denials this
# branch actually ships (catalog admin is always 403; a self-registered
# user is role=user and cannot call admin questionnaire writes).
set -euo pipefail

BASE="${BASE_URL:-http://127.0.0.1:3000/api}"
PASS_COUNT=0
FAIL_COUNT=0
STAMP="$(date +%s)"
EMAIL="smoke-${STAMP}@example.com"
PASSWORD='Password1!'

tmpdir="$(mktemp -d)"
trap 'rm -rf "$tmpdir"' EXIT

pass() {
  PASS_COUNT=$((PASS_COUNT + 1))
  printf 'PASS  %s\n' "$1"
}

fail() {
  FAIL_COUNT=$((FAIL_COUNT + 1))
  printf 'FAIL  %s\n' "$1" >&2
}

# request METHOD PATH [json-body] [bearer]
# writes status to $tmpdir/status and body to $tmpdir/body
request() {
  local method="$1" path="$2" body="${3:-}" token="${4:-}"
  local -a args=(-sS -o "$tmpdir/body" -w '%{http_code}' -X "$method" "${BASE}${path}" -H 'Accept: application/json')
  if [[ -n "$token" ]]; then
    args+=(-H "Authorization: Bearer ${token}")
  fi
  if [[ -n "$body" ]]; then
    args+=(-H 'Content-Type: application/json' --data "$body")
  fi
  curl "${args[@]}" >"$tmpdir/status"
}

expect_status() {
  local name="$1" want="$2"
  local got
  got="$(cat "$tmpdir/status")"
  if [[ "$got" == "$want" ]]; then
    pass "$name ($got)"
  else
    fail "$name (wanted $want, got $got) $(tr '\n' ' ' <"$tmpdir/body" | cut -c1-240)"
  fi
}

expect_jq() {
  local name="$1" filter="$2"
  if jq -e "$filter" "$tmpdir/body" >/dev/null; then
    pass "$name"
  else
    fail "$name (jq: $filter) $(tr '\n' ' ' <"$tmpdir/body" | cut -c1-240)"
  fi
}

echo "Base: $BASE"
echo

request GET /docs-json
expect_status 'swagger json' 200

request GET /courses
expect_status 'GET /courses' 200
expect_jq 'courses envelope data+meta' 'has("data") and has("meta") and (.meta | has("total") and has("limit") and has("offset")) and (.data | type == "array")'

request GET '/courses?page=2&limit=1'
expect_status 'GET /courses page=2' 200
expect_jq 'page=2 offset is limit' '.meta.limit == 1 and .meta.offset == 1'

request GET '/courses?offset=5&limit=1'
expect_status 'GET /courses offset=5' 200
expect_jq 'explicit offset wins' '.meta.limit == 1 and .meta.offset == 5'

request GET '/courses?unknown=1'
expect_status 'unknown query rejected' 400

request GET /courses/0
expect_status 'course id 0 rejected' 400

request GET /courses/2147483647
expect_status 'missing course is 404' 404

request GET /levels
expect_status 'GET /levels' 200
expect_jq 'levels wrapped array' '.data | type == "array" and length > 0'

request GET /categories
expect_status 'GET /categories' 200
expect_jq 'categories wrapped array' '.data | type == "array"'

request GET /technologies
expect_status 'GET /technologies' 200
expect_jq 'technologies wrapped array' '.data | type == "array"'

request GET /categories/2147483647
expect_status 'missing category is 404' 404

request POST /categories '{"name":"Smoke"}'
expect_status 'category write blocked' 403

request POST /technologies '{"name":"Smoke"}'
expect_status 'technology write blocked' 403

request POST /admin/courses '{"title":"Smoke"}'
expect_status 'admin course create blocked' 403

request GET /admin/courses
expect_status 'admin course list blocked' 403

code="$(curl -sS -o "$tmpdir/body" -w '%{http_code}' -D "$tmpdir/discord.hdr" "${BASE}/auth/discord")"
if [[ "$code" == "302" ]] && grep -qi '^location: .*discord' "$tmpdir/discord.hdr"; then
  pass "GET /auth/discord redirects ($code)"
else
  fail "GET /auth/discord (wanted 302 to Discord, got $code) $(tr '\n' ' ' <"$tmpdir/body" | cut -c1-180)"
fi

request POST /auth/register "$(jq -nc --arg email "$EMAIL" --arg password "$PASSWORD" '{email:$email,password:$password,first_name:"smoke",last_name:"user",role:"admin"}')"
expect_status 'public register rejects role' 400

request POST /auth/register "$(jq -nc --arg email "$EMAIL" --arg password "$PASSWORD" '{email:$email,password:$password,first_name:"smoke",last_name:"user"}')"
expect_status 'POST /auth/register' 201
expect_jq 'register envelope' '.data.accessToken | type == "string"'
expect_jq 'register user camelCase' '.data.user | has("firstName") and has("lastName") and has("isTwoFactorEnabled") and has("mustChangePassword")'
expect_jq 'register has no password' '[.. | objects | keys[]] | index("password") | not'
expect_jq 'self-register is user' '.data.user.role == "user"'
TOKEN="$(jq -r '.data.accessToken' "$tmpdir/body")"
USER_ID="$(jq -r '.data.user.id' "$tmpdir/body")"

request POST /auth/login "$(jq -nc --arg email "$EMAIL" --arg password 'Wrongpass1!' '{email:$email,password:$password}')"
expect_status 'bad password is 401' 401

request POST /auth/login "$(jq -nc --arg email "$EMAIL" --arg password "$PASSWORD" '{email:$email,password:$password}')"
expect_status 'POST /auth/login' 201
expect_jq 'login accessToken camelCase' '.data.accessToken | type == "string"'
expect_jq 'login has no password' '[.. | objects | keys[]] | index("password") | not'
TOKEN="$(jq -r '.data.accessToken' "$tmpdir/body")"

request GET /auth/renovated '' "$TOKEN"
expect_status 'GET /auth/renovated' 200
expect_jq 'session refresh envelope' '.data.user.id == "'"$USER_ID"'" and (.data.token | type == "string")'

request POST /2fa/generate '' "$TOKEN"
expect_status 'POST /2fa/generate' 201
expect_jq '2fa setup envelope' '.data | has("otpauthUrl") and has("qr") and has("pending") and (.secret | type == "string")'

request GET /user '' "$TOKEN"
expect_status 'user list denied for role user' 403

request GET "/user/${USER_ID}" '' "$TOKEN"
expect_status 'user detail denied for role user' 403

request GET /user/00000000-0000-4000-8000-000000000000 '' "$TOKEN"
expect_status 'missing user still denied before lookup' 403

request POST /questionnaires '{"title":"Smoke intake"}' "$TOKEN"
expect_status 'create questionnaire denied' 403

request GET /questionnaires/active '' "$TOKEN"
expect_status 'GET /questionnaires/active' 200
expect_jq 'active questionnaires envelope' '.data | type == "array"'

request GET /questionnaires/active/2147483647 '' "$TOKEN"
expect_status 'missing active questionnaire is 404' 404

request GET /questionnaires '' "$TOKEN"
expect_status 'admin questionnaire list denied' 403

# Unknown fields are rejected by the validation pipe only after guards.
# A 400 here means the admin role check never ran. A valid body is not sent,
# so this probe does not rewrite question or option rows.
request PATCH /questions/1 '{"unexpected":true}' "$TOKEN"
expect_status 'question update denied before validation' 403

request PATCH /answer-options/1 '{"unexpected":true}' "$TOKEN"
expect_status 'option update denied before validation' 403

echo
printf 'Result: %s passed, %s failed\n' "$PASS_COUNT" "$FAIL_COUNT"
if [[ "$FAIL_COUNT" -ne 0 ]]; then
  exit 1
fi
