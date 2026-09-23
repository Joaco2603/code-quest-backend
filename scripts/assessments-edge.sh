#!/usr/bin/env bash
# Extreme-case catalog for /api/assessments.
# Needs an admin that can log in. Students are created on each run.
#
#   ADMIN_EMAIL=admin@example.com ADMIN_PASSWORD='EdgeAdmin1!' ./scripts/assessments-edge.sh
#
# Optional: BASE_URL (default http://localhost:3000/api)
set -euo pipefail

BASE="${BASE_URL:-http://localhost:3000/api}"
ADMIN_EMAIL="${ADMIN_EMAIL:-}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-}"
TAG="$(date +%s)"
PASS1='EdgeCase1!'
PASS2='EdgeCase2!'
BODY_FILE="$(mktemp)"
SECRET_DIR="${EDGE_SECRET_DIR:-/tmp/codequest-edge-2fa}"
trap 'rm -f "$BODY_FILE"' EXIT
mkdir -p "$SECRET_DIR"
chmod 700 "$SECRET_DIR"

if [[ -z "$ADMIN_EMAIL" || -z "$ADMIN_PASSWORD" ]]; then
  echo "Set ADMIN_EMAIL and ADMIN_PASSWORD for an existing admin." >&2
  exit 1
fi

command -v jq >/dev/null
command -v python3 >/dev/null
command -v curl >/dev/null

totp() {
  python3 - "$1" <<'PY'
import hmac, hashlib, struct, time, base64, sys
secret = sys.argv[1].strip().replace(" ", "").upper()
pad = "=" * ((8 - len(secret) % 8) % 8)
key = base64.b32decode(secret + pad, casefold=True)
counter = int(time.time()) // 30
digest = hmac.new(key, struct.pack(">Q", counter), hashlib.sha1).digest()
offset = digest[-1] & 0x0F
code = (struct.unpack(">I", digest[offset:offset + 4])[0] & 0x7FFFFFFF) % 1000000
print(f"{code:06d}")
PY
}

request() {
  local method="$1" path="$2" auth="$3" data="$4"
  local -a cmd=(curl -sS -o "$BODY_FILE" -w '%{http_code}' -X "$method" "${BASE}${path}" -H 'Accept: application/json')
  case "$auth" in
    none) ;;
    bad) cmd+=(-H 'Authorization: Bearer not-a-jwt') ;;
    *) cmd+=(-H "Authorization: Bearer ${auth}") ;;
  esac
  if [[ -n "$data" ]]; then
    cmd+=(-H 'Content-Type: application/json' --data "$data")
  fi
  local code
  code="$("${cmd[@]}")"
  if [[ "$code" == "429" ]]; then
    echo "rate limited on $method $path; sleeping 65s" >&2
    sleep 65
    code="$("${cmd[@]}")"
  fi
  printf '%s' "$code"
}

expect() {
  local id="$1" method="$2" path="$3" auth="$4" data="$5" want="$6" fragment="${7:-}"
  local got
  got="$(request "$method" "$path" "$auth" "$data")"
  local body
  body="$(cat "$BODY_FILE")"
  if [[ "$got" != "$want" ]]; then
    echo "FAIL $id expected $want got $got" >&2
    echo "$body" >&2
    exit 1
  fi
  if [[ -n "$fragment" ]] && ! grep -q -F -- "$fragment" <<<"$body"; then
    echo "FAIL $id status $got missing fragment: $fragment" >&2
    echo "$body" >&2
    exit 1
  fi
  echo "OK  $id $want"
}

expect_jq() {
  local id="$1"
  shift
  if ! jq -e "$@" "$BODY_FILE" >/dev/null; then
    echo "FAIL $id jq" >&2
    cat "$BODY_FILE" >&2
    exit 1
  fi
  echo "OK  $id jq"
}

save_secret() {
  printf '%s\n' "$2" >"$SECRET_DIR/$1"
  chmod 600 "$SECRET_DIR/$1"
}

load_secret() {
  cat "$SECRET_DIR/$1"
}

login_json() {
  request POST /auth/login none "$(jq -nc --arg email "$1" --arg password "$2" '{email:$email,password:$password}')"
}

verify_2fa() {
  local temp="$1" secret="$2"
  local code
  code="$(totp "$secret")"
  local status
  status="$(request POST /auth/2fa/verify "$temp" "$(jq -nc --arg code "$code" '{code:$code}')")"
  if [[ "$status" != "201" && "$status" != "200" ]]; then
    echo "2FA verify failed ($status)" >&2
    cat "$BODY_FILE" >&2
    exit 1
  fi
  jq -r '.access_token' "$BODY_FILE"
}

# Prints the access token. Writes the pre-verify temp JWT to last-temp.
# Pass 1 as the third argument only for disposable students that must change password.
access_token_for() {
  local email="$1" password="$2" allow_password_change="${3:-0}"
  local status
  status="$(login_json "$email" "$password")"
  if [[ "$status" != "201" && "$status" != "200" ]]; then
    echo "login failed for $email ($status)" >&2
    cat "$BODY_FILE" >&2
    exit 1
  fi
  if jq -e '.requiresPasswordChange == true' "$BODY_FILE" >/dev/null; then
    if [[ "$allow_password_change" != "1" ]]; then
      echo "$email must change password before this script can continue" >&2
      exit 1
    fi
    local temp
    temp="$(jq -r '.tempToken' "$BODY_FILE")"
    status="$(request POST /auth/change-password "$temp" "$(jq -nc --arg password "$PASS2" '{password:$password}')")"
    if [[ "$status" != "201" && "$status" != "200" ]]; then
      echo "change-password failed for $email ($status)" >&2
      cat "$BODY_FILE" >&2
      exit 1
    fi
    password="$PASS2"
    status="$(login_json "$email" "$password")"
  fi
  TEMP_TOKEN="$(jq -r '.tempToken // empty' "$BODY_FILE")"
  printf '%s\n' "$TEMP_TOKEN" >"$SECRET_DIR/last-temp"
  if jq -e '.requiresSetup == true' "$BODY_FILE" >/dev/null; then
    local secret
    secret="$(jq -r '.secret' "$BODY_FILE")"
    save_secret "$email" "$secret"
    verify_2fa "$TEMP_TOKEN" "$secret"
    return
  fi
  if jq -e '.requires2FA == true' "$BODY_FILE" >/dev/null; then
    if [[ ! -f "$SECRET_DIR/$email" ]]; then
      echo "2FA already enabled for $email and no secret in $SECRET_DIR/$email" >&2
      exit 1
    fi
    verify_2fa "$TEMP_TOKEN" "$(load_secret "$email")"
    return
  fi
  jq -r '.access_token' "$BODY_FILE"
}

create_user() {
  local email="$1"
  local status
  status="$(request POST /auth/register/user "$TOKEN_ADMIN" "$(jq -nc \
    --arg email "$email" --arg password "$PASS1" \
    '{email:$email,password:$password,first_name:"edge",last_name:"case",address:"local test bench"}')")"
  if [[ "$status" != "201" ]]; then
    echo "register failed for $email ($status)" >&2
    cat "$BODY_FILE" >&2
    exit 1
  fi
}

admin_call() {
  local method="$1" path="$2" data="${3:-}"
  local status
  status="$(request "$method" "$path" "$TOKEN_ADMIN" "$data")"
  if [[ "$status" != 2* ]]; then
    echo "admin $method $path failed ($status)" >&2
    cat "$BODY_FILE" >&2
    exit 1
  fi
}

add_question() {
  local questionnaire="$1" text="$2" type="$3" sort="$4" options="$5"
  admin_call POST "/questionnaires/${questionnaire}/questions" "$(jq -nc \
    --arg question "$text" --arg type "$type" --argjson sortOrder "$sort" --argjson options "$options" \
    '{question:$question,type:$type,sortOrder:$sortOrder,options:$options}')"
}

echo "login admin"
TOKEN_ADMIN="$(access_token_for "$ADMIN_EMAIL" "$ADMIN_PASSWORD")"
EMAIL_A="edge-a-${TAG}@example.com"
EMAIL_B="edge-b-${TAG}@example.com"
create_user "$EMAIL_A"
create_user "$EMAIL_B"
echo "login students"
TOKEN_A="$(access_token_for "$EMAIL_A" "$PASS1" 1)"
TOKEN_TEMP="$(cat "$SECRET_DIR/last-temp")"
TOKEN_B="$(access_token_for "$EMAIL_B" "$PASS1" 1)"

# --- Auth and shape. A04 waits for the fixture id. ---
expect A01 GET /assessments none '' 401
expect A02 GET /assessments bad '' 401
expect A03 GET /assessments "$TOKEN_TEMP" '' 403 '2FA is required'
expect A05 POST /assessments "$TOKEN_A" '{"questionnaireId":1,"role":"admin"}' 400 'Validation failed'
expect A06 PUT /assessments/1/answers "$TOKEN_A" '{"questionId":1,"role":"admin"}' 400 'Validation failed'
expect A07 POST /assessments "$TOKEN_A" '{}' 400 'Validation failed'
expect A08 POST /assessments "$TOKEN_A" '{"questionnaireId":"1"}' 400 'Validation failed'
expect A09 POST /assessments "$TOKEN_A" '{"questionnaireId":0}' 400 'Validation failed'
expect A10 POST /assessments "$TOKEN_A" '{"questionnaireId":-1}' 400 'Validation failed'
expect A11 POST /assessments "$TOKEN_A" '{"questionnaireId":1.5}' 400 'Validation failed'
expect A12 POST /assessments "$TOKEN_A" '{"questionnaireId":null}' 400 'Validation failed'
expect A13 GET /assessments/abc "$TOKEN_A" '' 400
expect A14 GET /assessments/1.5 "$TOKEN_A" '' 400
expect A15 GET /assessments/0 "$TOKEN_A" '' 404 'Assessment not found'
expect A16 PUT /assessments/1/answers "$TOKEN_A" '{}' 400 'Validation failed'
expect A17 PUT /assessments/1/answers "$TOKEN_A" '{"questionId":0}' 400 'Validation failed'
expect A18 PUT /assessments/1/answers "$TOKEN_A" '{"questionId":1,"answerOptionIds":[1,1]}' 400 'Validation failed'
expect_jq A18 '(.errors | join(" ")) | test("unique")'
expect A19 PUT /assessments/1/answers "$TOKEN_A" '{"questionId":1,"answerOptionIds":["x"]}' 400 'Validation failed'

# --- Fixture ---
admin_call POST /questionnaires "$(jq -nc --arg title "edge-$TAG-main" '{title:$title}')"
Q="$(jq -r '.id' "$BODY_FILE")"

add_question "$Q" 'single' single_choice 0 '[{"label":"A","sortOrder":0},{"label":"B","sortOrder":1}]'
QS="$(jq -r '.id' "$BODY_FILE")"
OPT_A="$(jq -r '.options[0].id' "$BODY_FILE")"
OPT_B="$(jq -r '.options[1].id' "$BODY_FILE")"

add_question "$Q" 'multi' multiple_choice 1 '[{"label":"M1","sortOrder":0},{"label":"M2","sortOrder":1}]'
QM="$(jq -r '.id' "$BODY_FILE")"
OPT_M1="$(jq -r '.options[0].id' "$BODY_FILE")"
OPT_M2="$(jq -r '.options[1].id' "$BODY_FILE")"

add_question "$Q" 'text' text 2 '[]'
QT="$(jq -r '.id' "$BODY_FILE")"
add_question "$Q" 'number' number 3 '[]'
QN="$(jq -r '.id' "$BODY_FILE")"
add_question "$Q" 'boolean' boolean 4 '[]'
QB="$(jq -r '.id' "$BODY_FILE")"

add_question "$Q" 'inactive' single_choice 5 '[{"label":"off","sortOrder":0}]'
Q_INACTIVE="$(jq -r '.id' "$BODY_FILE")"
admin_call DELETE "/questions/${Q_INACTIVE}"

add_question "$Q" 'other' single_choice 6 '[{"label":"other","sortOrder":0}]'
QS2="$(jq -r '.id' "$BODY_FILE")"
OPT_OTHER="$(jq -r '.options[0].id' "$BODY_FILE")"
# Keep the foreign option row, but drop the question from the active snapshot so C05 is not blocked by it.
admin_call DELETE "/questions/${QS2}"

admin_call POST /questionnaires "$(jq -nc --arg title "edge-$TAG-q3" '{title:$title}')"
Q3="$(jq -r '.id' "$BODY_FILE")"
add_question "$Q3" 'foreign' single_choice 0 '[{"label":"f","sortOrder":0}]'
Q3_Q="$(jq -r '.id' "$BODY_FILE")"

admin_call POST /questionnaires "$(jq -nc --arg title "edge-$TAG-off" '{title:$title}')"
Q_OFF="$(jq -r '.id' "$BODY_FILE")"
add_question "$Q_OFF" 'off choice' single_choice 0 '[{"label":"x","sortOrder":0}]'
admin_call DELETE "/questionnaires/${Q_OFF}"

admin_call POST /questionnaires "$(jq -nc --arg title "edge-$TAG-empty" '{title:$title}')"
Q_EMPTY="$(jq -r '.id' "$BODY_FILE")"

admin_call POST /questionnaires "$(jq -nc --arg title "edge-$TAG-bare" '{title:$title}')"
Q_BARE="$(jq -r '.id' "$BODY_FILE")"
add_question "$Q_BARE" 'bare' single_choice 0 '[]'

expect F01 GET "/questionnaires/active/${Q}" "$TOKEN_A" '' 200
expect_jq F01 --argjson inactive "$Q_INACTIVE" '([.questions[].id] | index($inactive)) == null'

expect A04 POST /assessments "$TOKEN_ADMIN" "$(jq -nc --argjson questionnaireId "$Q" '{questionnaireId:$questionnaireId}')" 403

# --- Start ---
expect S01 POST /assessments "$TOKEN_A" '{"questionnaireId":999999999}' 404 'was not found'
expect S02 POST /assessments "$TOKEN_A" "$(jq -nc --argjson questionnaireId "$Q_OFF" '{questionnaireId:$questionnaireId}')" 404 'was not found'
expect S03 POST /assessments "$TOKEN_A" "$(jq -nc --argjson questionnaireId "$Q_BARE" '{questionnaireId:$questionnaireId}')" 409 'has no answer options'
expect S04 POST /assessments "$TOKEN_A" "$(jq -nc --argjson questionnaireId "$Q_EMPTY" '{questionnaireId:$questionnaireId}')" 201 '"completedAt":null'
ID_EMPTY="$(jq -r '.id' "$BODY_FILE")"
expect S05 POST /assessments "$TOKEN_A" "$(jq -nc --argjson questionnaireId "$Q" '{questionnaireId:$questionnaireId}')" 201
ID_A="$(jq -r '.id' "$BODY_FILE")"
expect S06 POST /assessments "$TOKEN_A" "$(jq -nc --argjson questionnaireId "$Q" '{questionnaireId:$questionnaireId}')" 409 'incomplete assessment already exists'
expect S07 POST /assessments "$TOKEN_B" "$(jq -nc --argjson questionnaireId "$Q" '{questionnaireId:$questionnaireId}')" 201
ID_B="$(jq -r '.id' "$BODY_FILE")"

# --- Read ---
expect R01 GET /assessments "$TOKEN_A" '' 200
expect_jq R01 --argjson a "$ID_A" --argjson b "$ID_B" '(map(.id) | index($a)) != null and (map(.id) | index($b)) == null'
expect R02 GET /assessments "$TOKEN_A" '' 200
expect_jq R02 --argjson a "$ID_A" '.[] | select(.id == $a) | has("answers") | not'
expect R03 GET "/assessments/${ID_A}" "$TOKEN_A" '' 200 '"answers":[]'
expect_jq R03 '.completedAt == null'
expect R04 GET "/assessments/${ID_B}" "$TOKEN_A" '' 404 'Assessment not found'
expect R05 GET /assessments/2147483647 "$TOKEN_A" '' 404

# --- Answers ---
expect U01 PUT "/assessments/${ID_B}/answers" "$TOKEN_A" "$(jq -nc --argjson questionId "$QS" --argjson answerOptionId "$OPT_A" '{questionId:$questionId,answerOptionId:$answerOptionId}')" 404 'Assessment not found'
expect U02 PUT /assessments/999999999/answers "$TOKEN_A" "$(jq -nc --argjson questionId "$QS" --argjson answerOptionId "$OPT_A" '{questionId:$questionId,answerOptionId:$answerOptionId}')" 404
expect U03 PUT "/assessments/${ID_A}/answers" "$TOKEN_A" "$(jq -nc --argjson questionId "$Q3_Q" --argjson answerOptionId 1 '{questionId:$questionId,answerOptionId:$answerOptionId}')" 400 'does not belong'
expect U04 PUT "/assessments/${ID_A}/answers" "$TOKEN_A" "$(jq -nc --argjson questionId "$Q_INACTIVE" --argjson answerOptionId "$OPT_A" '{questionId:$questionId,answerOptionId:$answerOptionId}')" 400 'does not belong'
expect U05 PUT "/assessments/${ID_A}/answers" "$TOKEN_A" "$(jq -nc --argjson questionId "$QS" '{questionId:$questionId}')" 400 'exactly one'
expect U06 PUT "/assessments/${ID_A}/answers" "$TOKEN_A" "$(jq -nc --argjson questionId "$QS" '{questionId:$questionId,answerOptionIds:[]}')" 400 'exactly one'
expect U07 PUT "/assessments/${ID_A}/answers" "$TOKEN_A" "$(jq -nc --argjson questionId "$QS" --argjson a "$OPT_A" --argjson b "$OPT_B" '{questionId:$questionId,answerOptionIds:[$a,$b]}')" 400 'exactly one'
expect U08 PUT "/assessments/${ID_A}/answers" "$TOKEN_A" "$(jq -nc --argjson questionId "$QS" --argjson a "$OPT_A" --argjson b "$OPT_B" '{questionId:$questionId,answerOptionId:$a,answerOptionIds:[$b]}')" 400 'must be included in answerOptionIds'
expect U09 PUT "/assessments/${ID_A}/answers" "$TOKEN_A" "$(jq -nc --argjson questionId "$QS" --argjson answerOptionId "$OPT_OTHER" '{questionId:$questionId,answerOptionId:$answerOptionId}')" 400 'does not belong to this question'
# Count is checked before option ownership, so a foreign id in a two-item list is "exactly one".
expect U10 PUT "/assessments/${ID_A}/answers" "$TOKEN_A" "$(jq -nc --argjson questionId "$QS" --argjson a "$OPT_A" --argjson o "$OPT_OTHER" '{questionId:$questionId,answerOptionIds:[$a,$o]}')" 400 'exactly one'
expect U11 PUT "/assessments/${ID_A}/answers" "$TOKEN_A" "$(jq -nc --argjson questionId "$QS" --argjson answerOptionId "$OPT_A" '{questionId:$questionId,answerOptionId:$answerOptionId}')" 200
expect_jq U11 --argjson opt "$OPT_A" '[.answers[] | select(.answerOptionId == $opt and .value == null)] | length == 1'
expect U12 PUT "/assessments/${ID_A}/answers" "$TOKEN_A" "$(jq -nc --argjson questionId "$QS" --argjson answerOptionId "$OPT_A" '{questionId:$questionId,answerOptionId:$answerOptionId,answerOptionIds:[$answerOptionId]}')" 200
expect_jq U12 --argjson q "$QS" '[.answers[] | select(.questionId == $q)] | length == 1'
expect U13 PUT "/assessments/${ID_A}/answers" "$TOKEN_A" "$(jq -nc --argjson questionId "$QS" --argjson answerOptionId "$OPT_B" '{questionId:$questionId,answerOptionIds:[$answerOptionId],value:"ignored"}')" 200
expect_jq U13 --argjson opt "$OPT_B" --argjson gone "$OPT_A" '([.answers[] | select(.answerOptionId == $opt and .value == null)] | length == 1) and ([.answers[] | select(.answerOptionId == $gone)] | length == 0)'

expect U14 PUT "/assessments/${ID_A}/answers" "$TOKEN_A" "$(jq -nc --argjson questionId "$QM" '{questionId:$questionId,answerOptionIds:[]}')" 400 'at least one'
expect U15 PUT "/assessments/${ID_A}/answers" "$TOKEN_A" "$(jq -nc --argjson questionId "$QM" --argjson answerOptionId "$OPT_M1" '{questionId:$questionId,answerOptionId:$answerOptionId}')" 200
expect_jq U15 --argjson q "$QM" '[.answers[] | select(.questionId == $q)] | length == 1'
expect U16 PUT "/assessments/${ID_A}/answers" "$TOKEN_A" "$(jq -nc --argjson questionId "$QM" --argjson a "$OPT_M1" --argjson b "$OPT_M2" '{questionId:$questionId,answerOptionIds:[$a,$b]}')" 200
expect_jq U16 --argjson q "$QM" '[.answers[] | select(.questionId == $q and .value == null)] | length == 2'
expect U17 PUT "/assessments/${ID_A}/answers" "$TOKEN_A" "$(jq -nc --argjson questionId "$QM" --argjson answerOptionId "$OPT_M2" '{questionId:$questionId,answerOptionIds:[$answerOptionId]}')" 200
expect_jq U17 --argjson q "$QM" --argjson keep "$OPT_M2" --argjson gone "$OPT_M1" '([.answers[] | select(.questionId == $q)] | length == 1) and ([.answers[] | select(.answerOptionId == $keep)] | length == 1) and ([.answers[] | select(.answerOptionId == $gone)] | length == 0)'
expect U18a PUT "/assessments/${ID_A}/answers" "$TOKEN_A" "$(jq -nc --argjson questionId "$QM" --argjson a "$OPT_M1" --argjson o "$OPT_OTHER" '{questionId:$questionId,answerOptionIds:[$a,$o]}')" 400 'does not belong'
expect U18b GET "/assessments/${ID_A}" "$TOKEN_A" '' 200
expect_jq U18b --argjson keep "$OPT_M2" --argjson gone "$OPT_M1" '([.answers[] | select(.answerOptionId == $keep)] | length == 1) and ([.answers[] | select(.answerOptionId == $gone)] | length == 0)'

expect U19 PUT "/assessments/${ID_A}/answers" "$TOKEN_A" "$(jq -nc --argjson questionId "$QT" --argjson answerOptionId "$OPT_A" '{questionId:$questionId,answerOptionId:$answerOptionId,value:"hola"}')" 400 'does not accept answer options'
expect U20 PUT "/assessments/${ID_A}/answers" "$TOKEN_A" "$(jq -nc --argjson questionId "$QT" '{questionId:$questionId}')" 400 'non-empty string'
expect U21 PUT "/assessments/${ID_A}/answers" "$TOKEN_A" "$(jq -nc --argjson questionId "$QT" '{questionId:$questionId,value:""}')" 400 'non-empty string'
expect U22 PUT "/assessments/${ID_A}/answers" "$TOKEN_A" "$(jq -nc --argjson questionId "$QT" '{questionId:$questionId,value:"   "}')" 400 'non-empty string'
expect U23 PUT "/assessments/${ID_A}/answers" "$TOKEN_A" "$(jq -nc --argjson questionId "$QT" '{questionId:$questionId,value:1}')" 400 'non-empty string'
expect U24 PUT "/assessments/${ID_A}/answers" "$TOKEN_A" "$(jq -nc --argjson questionId "$QT" '{questionId:$questionId,value:true}')" 400 'non-empty string'
expect U25 PUT "/assessments/${ID_A}/answers" "$TOKEN_A" "$(jq -nc --argjson questionId "$QT" '{questionId:$questionId,value:"  hola  "}')" 200 '"value":"hola"'
expect_jq U25 --argjson q "$QT" '[.answers[] | select(.questionId == $q and .value == "hola" and .answerOptionId == null)] | length == 1'

expect U26 PUT "/assessments/${ID_A}/answers" "$TOKEN_A" "$(jq -nc --argjson questionId "$QN" --argjson answerOptionId "$OPT_A" '{questionId:$questionId,answerOptionIds:[$answerOptionId],value:1}')" 400 'does not accept answer options'
expect U27 PUT "/assessments/${ID_A}/answers" "$TOKEN_A" "$(jq -nc --argjson questionId "$QN" '{questionId:$questionId}')" 400 'finite number'
expect U28 PUT "/assessments/${ID_A}/answers" "$TOKEN_A" "$(jq -nc --argjson questionId "$QN" '{questionId:$questionId,value:null}')" 400 'finite number'
expect U29 PUT "/assessments/${ID_A}/answers" "$TOKEN_A" "$(jq -nc --argjson questionId "$QN" '{questionId:$questionId,value:true}')" 400 'finite number'
expect U30 PUT "/assessments/${ID_A}/answers" "$TOKEN_A" "$(jq -nc --argjson questionId "$QN" '{questionId:$questionId,value:"abc"}')" 400 'finite number'
expect U31 PUT "/assessments/${ID_A}/answers" "$TOKEN_A" "$(jq -nc --argjson questionId "$QN" '{questionId:$questionId,value:"Infinity"}')" 400 'finite number'
expect U32 PUT "/assessments/${ID_A}/answers" "$TOKEN_A" "$(jq -nc --argjson questionId "$QN" '{questionId:$questionId,value:""}')" 200 '"value":"0"'
expect U33 PUT "/assessments/${ID_A}/answers" "$TOKEN_A" "$(jq -nc --argjson questionId "$QN" '{questionId:$questionId,value:"   "}')" 200 '"value":"0"'
expect U34 PUT "/assessments/${ID_A}/answers" "$TOKEN_A" "$(jq -nc --argjson questionId "$QN" '{questionId:$questionId,value:0}')" 200 '"value":"0"'
expect U35 PUT "/assessments/${ID_A}/answers" "$TOKEN_A" "$(jq -nc --argjson questionId "$QN" '{questionId:$questionId,value:-1}')" 200 '"value":"-1"'
expect U36 PUT "/assessments/${ID_A}/answers" "$TOKEN_A" "$(jq -nc --argjson questionId "$QN" '{questionId:$questionId,value:"  3.5  "}')" 200 '"value":"3.5"'

expect U37 PUT "/assessments/${ID_A}/answers" "$TOKEN_A" "$(jq -nc --argjson questionId "$QB" --argjson answerOptionId "$OPT_A" '{questionId:$questionId,answerOptionId:$answerOptionId,value:true}')" 400 'does not accept answer options'
expect U38 PUT "/assessments/${ID_A}/answers" "$TOKEN_A" "$(jq -nc --argjson questionId "$QB" '{questionId:$questionId}')" 400 'true or false'
expect U39 PUT "/assessments/${ID_A}/answers" "$TOKEN_A" "$(jq -nc --argjson questionId "$QB" '{questionId:$questionId,value:null}')" 400 'true or false'
expect U40 PUT "/assessments/${ID_A}/answers" "$TOKEN_A" "$(jq -nc --argjson questionId "$QB" '{questionId:$questionId,value:"yes"}')" 400 'true or false'
expect U41 PUT "/assessments/${ID_A}/answers" "$TOKEN_A" "$(jq -nc --argjson questionId "$QB" '{questionId:$questionId,value:1}')" 400 'true or false'
expect U42 PUT "/assessments/${ID_A}/answers" "$TOKEN_A" "$(jq -nc --argjson questionId "$QB" '{questionId:$questionId,value:"TRUE"}')" 400 'true or false'
expect U43 PUT "/assessments/${ID_A}/answers" "$TOKEN_A" "$(jq -nc --argjson questionId "$QB" '{questionId:$questionId,value:" true "}')" 400 'true or false'
expect U44 PUT "/assessments/${ID_A}/answers" "$TOKEN_A" "$(jq -nc --argjson questionId "$QB" '{questionId:$questionId,value:true}')" 200 '"value":"true"'
expect U45 PUT "/assessments/${ID_A}/answers" "$TOKEN_A" "$(jq -nc --argjson questionId "$QB" '{questionId:$questionId,value:false}')" 200 '"value":"false"'
expect U46 PUT "/assessments/${ID_A}/answers" "$TOKEN_A" "$(jq -nc --argjson questionId "$QB" '{questionId:$questionId,value:"true"}')" 200 '"value":"true"'
expect U47 PUT "/assessments/${ID_A}/answers" "$TOKEN_A" "$(jq -nc --argjson questionId "$QB" '{questionId:$questionId,value:"false"}')" 200 '"value":"false"'

# --- Complete ---
expect C01 POST "/assessments/${ID_B}/complete" "$TOKEN_A" '' 404
expect C02 POST "/assessments/${ID_B}/complete" "$TOKEN_B" '' 400 'All active questions must be answered'

admin_call POST /questionnaires "$(jq -nc --arg title "edge-$TAG-partial" '{title:$title}')"
Q_PARTIAL="$(jq -r '.id' "$BODY_FILE")"
add_question "$Q_PARTIAL" 'p-single' single_choice 0 '[{"label":"A","sortOrder":0}]'
P_QS="$(jq -r '.id' "$BODY_FILE")"
P_OPT="$(jq -r '.options[0].id' "$BODY_FILE")"
add_question "$Q_PARTIAL" 'p-multi' multiple_choice 1 '[{"label":"M","sortOrder":0}]'
P_QM="$(jq -r '.id' "$BODY_FILE")"
P_OPTM="$(jq -r '.options[0].id' "$BODY_FILE")"
add_question "$Q_PARTIAL" 'p-text' text 2 '[]'
P_QT="$(jq -r '.id' "$BODY_FILE")"
add_question "$Q_PARTIAL" 'p-number' number 3 '[]'
P_QN="$(jq -r '.id' "$BODY_FILE")"
add_question "$Q_PARTIAL" 'p-bool' boolean 4 '[]'
expect S_PARTIAL POST /assessments "$TOKEN_A" "$(jq -nc --argjson questionnaireId "$Q_PARTIAL" '{questionnaireId:$questionnaireId}')" 201
ID_PARTIAL="$(jq -r '.id' "$BODY_FILE")"
expect C03a PUT "/assessments/${ID_PARTIAL}/answers" "$TOKEN_A" "$(jq -nc --argjson questionId "$P_QS" --argjson answerOptionId "$P_OPT" '{questionId:$questionId,answerOptionId:$answerOptionId}')" 200
expect C03b PUT "/assessments/${ID_PARTIAL}/answers" "$TOKEN_A" "$(jq -nc --argjson questionId "$P_QM" --argjson answerOptionId "$P_OPTM" '{questionId:$questionId,answerOptionId:$answerOptionId}')" 200
expect C03c PUT "/assessments/${ID_PARTIAL}/answers" "$TOKEN_A" "$(jq -nc --argjson questionId "$P_QT" '{questionId:$questionId,value:"x"}')" 200
expect C03d PUT "/assessments/${ID_PARTIAL}/answers" "$TOKEN_A" "$(jq -nc --argjson questionId "$P_QN" '{questionId:$questionId,value:1}')" 200
expect C03 POST "/assessments/${ID_PARTIAL}/complete" "$TOKEN_A" '' 400 'All active questions must be answered'

admin_call POST /questionnaires "$(jq -nc --arg title "edge-$TAG-opt" '{title:$title}')"
Q_OPT="$(jq -r '.id' "$BODY_FILE")"
add_question "$Q_OPT" 'del-opt' single_choice 0 '[{"label":"only","sortOrder":0}]'
C4_Q="$(jq -r '.id' "$BODY_FILE")"
C4_OPT="$(jq -r '.options[0].id' "$BODY_FILE")"
expect S_OPT POST /assessments "$TOKEN_A" "$(jq -nc --argjson questionnaireId "$Q_OPT" '{questionnaireId:$questionnaireId}')" 201
ID_OPT="$(jq -r '.id' "$BODY_FILE")"
expect C04a PUT "/assessments/${ID_OPT}/answers" "$TOKEN_A" "$(jq -nc --argjson questionId "$C4_Q" --argjson answerOptionId "$C4_OPT" '{questionId:$questionId,answerOptionId:$answerOptionId}')" 200
expect C04 DELETE "/answer-options/${C4_OPT}" "$TOKEN_ADMIN" '' 500

expect C05 POST "/assessments/${ID_A}/complete" "$TOKEN_A" '' 201 '"completedAt":"'
expect C06 POST "/assessments/${ID_EMPTY}/complete" "$TOKEN_A" '' 201
expect C07 POST "/assessments/${ID_A}/complete" "$TOKEN_A" '' 409 'already completed'
expect C08 PUT "/assessments/${ID_A}/answers" "$TOKEN_A" "$(jq -nc --argjson questionId "$QT" '{questionId:$questionId,value:"later"}')" 409 'already completed'
expect C09 GET "/assessments/${ID_A}" "$TOKEN_A" '' 200 '"completedAt":"'
expect_jq C09 '(.answers | length) >= 5'

expect S08 POST /assessments "$TOKEN_A" "$(jq -nc --argjson questionnaireId "$Q" '{questionnaireId:$questionnaireId}')" 201

# --- Mid-attempt clones ---
admin_call POST /questionnaires "$(jq -nc --arg title "edge-$TAG-mid" '{title:$title}')"
Q_MID="$(jq -r '.id' "$BODY_FILE")"
add_question "$Q_MID" 'mid' single_choice 0 '[{"label":"m","sortOrder":0}]'
MID_Q="$(jq -r '.id' "$BODY_FILE")"
expect S_MID POST /assessments "$TOKEN_A" "$(jq -nc --argjson questionnaireId "$Q_MID" '{questionnaireId:$questionnaireId}')" 201
ID_MID="$(jq -r '.id' "$BODY_FILE")"
admin_call DELETE "/questionnaires/${Q_MID}"
expect M01 PUT "/assessments/${ID_MID}/answers" "$TOKEN_A" "$(jq -nc --argjson questionId "$MID_Q" '{questionId:$questionId}')" 404 'was not found'
expect M02 POST "/assessments/${ID_MID}/complete" "$TOKEN_A" '' 404 'was not found'

admin_call POST /questionnaires "$(jq -nc --arg title "edge-$TAG-strip-a" '{title:$title}')"
Q_STRIP_A="$(jq -r '.id' "$BODY_FILE")"
add_question "$Q_STRIP_A" 'strip-a' single_choice 0 '[{"label":"s","sortOrder":0}]'
STRIP_A_OPT="$(jq -r '.options[0].id' "$BODY_FILE")"
admin_call DELETE "/answer-options/${STRIP_A_OPT}"
expect M03a POST /assessments "$TOKEN_A" "$(jq -nc --argjson questionnaireId "$Q_STRIP_A" '{questionnaireId:$questionnaireId}')" 409 'has no answer options'

admin_call POST /questionnaires "$(jq -nc --arg title "edge-$TAG-strip-b" '{title:$title}')"
Q_STRIP="$(jq -r '.id' "$BODY_FILE")"
add_question "$Q_STRIP" 'strip-b' single_choice 0 '[{"label":"s","sortOrder":0}]'
STRIP_Q="$(jq -r '.id' "$BODY_FILE")"
STRIP_OPT="$(jq -r '.options[0].id' "$BODY_FILE")"
expect S_STRIP POST /assessments "$TOKEN_A" "$(jq -nc --argjson questionnaireId "$Q_STRIP" '{questionnaireId:$questionnaireId}')" 201
ID_STRIP="$(jq -r '.id' "$BODY_FILE")"
admin_call DELETE "/answer-options/${STRIP_OPT}"
expect M03b PUT "/assessments/${ID_STRIP}/answers" "$TOKEN_A" "$(jq -nc --argjson questionId "$STRIP_Q" '{questionId:$questionId}')" 409 'has no answer options'
expect M03c POST "/assessments/${ID_STRIP}/complete" "$TOKEN_A" '' 409 'has no answer options'

admin_call POST /questionnaires "$(jq -nc --arg title "edge-$TAG-m4" '{title:$title}')"
Q_M4="$(jq -r '.id' "$BODY_FILE")"
add_question "$Q_M4" 'm4-a' single_choice 0 '[{"label":"a","sortOrder":0}]'
M4_A="$(jq -r '.id' "$BODY_FILE")"
M4_OPT="$(jq -r '.options[0].id' "$BODY_FILE")"
add_question "$Q_M4" 'm4-b' single_choice 1 '[{"label":"b","sortOrder":0}]'
M4_B="$(jq -r '.id' "$BODY_FILE")"
expect S_M4 POST /assessments "$TOKEN_A" "$(jq -nc --argjson questionnaireId "$Q_M4" '{questionnaireId:$questionnaireId}')" 201
ID_M4="$(jq -r '.id' "$BODY_FILE")"
expect M04a PUT "/assessments/${ID_M4}/answers" "$TOKEN_A" "$(jq -nc --argjson questionId "$M4_A" --argjson answerOptionId "$M4_OPT" '{questionId:$questionId,answerOptionId:$answerOptionId}')" 200
admin_call DELETE "/questions/${M4_B}"
expect M04 POST "/assessments/${ID_M4}/complete" "$TOKEN_A" '' 201

echo "all edge cases passed"
