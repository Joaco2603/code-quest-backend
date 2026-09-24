# AGENTS.md — code-quest-backend

NestJS 12 API (TypeScript ESM `nodenext`, pnpm, TypeORM + PostgreSQL, Vitest). Global prefix `/api`. Docs: `/api/docs`, `/api/docs-json`, `/api/reference`.

## ESM imports

Relative imports MUST use `.js` extensions (`./app.module.js`, `../dist/...`). `src/` and `dist/` imports with `.ts`-style paths fail under `nodenext`.

## Setup / run (order matters)

```bash
pnpm install
cp .env.example .env   # fill JWT_SECRET (>=32 chars, no `change-me`), ENCRYPTION_KEY (64 hex)
docker compose -p codequest-dev -f compose.dev.yml up -d --wait  # dev DB on 127.0.0.1:5433, persistent volume
pnpm migration:run     # == pnpm build && typeorm migration:run -d dist/config/typeorm.js
pnpm start:dev          # watch; prod: pnpm build && pnpm start:prod (dist/main.js)
```

- Canonical dev compose is `compose.dev.yml` (postgres:17, port `${DB_PORT:-5433}->5432`, requires `DB_*` in `.env`). Root `docker-compose.yml` is legacy (postgres:16, hardcoded `5432`) — don't use it.
- `DB_SYNCHRONIZE=true` throws at startup (`use migrations`); `synchronize: false` is hardcoded in `src/config/database.ts`. `DB_MIGRATIONS_RUN` defaults false — migrations never run on boot unless explicitly enabled.
- `pnpm migration:revert` on the initial migration **drops catalog tables + data**. Only on disposable DBs.
- Proxied validation: `envs.ts` has two readers (`readEnvironment` + `readAuthEnvironment`); `JWT_SECRET` is required in every env, `DB_HOST/NAME/USER/PASSWORD` + Discord vars required in production, `DB_SSL` defaults true in prod. `ALLOWED_ORIGINS` is a comma list, `*` throws.

## Verify

```bash
pnpm lint       # oxlint --type-aware src/ test/ ; no-floating-promises is error, no-explicit-any is off
pnpm typecheck  # tsc --noEmit --incremental false
pnpm test       # == pnpm build && vitest run (unit: test/**/*.spec.ts, src/**/tests/**/*.spec.ts)
pnpm test:e2e   # == pnpm build && vitest run --config ./vitest.config.e2e.ts
```

- Tests import from `dist/`, not `src/` (decorator metadata). Scripts build first; after editing `src/` under `test:watch`, re-run `pnpm build` manually.
- Single unit test: `pnpm build && npx vitest run test/catalog.spec.ts`. Single e2e: `TEST_DATABASE_URL=... npx vitest run --config ./vitest.config.e2e.ts test/app.e2e-spec.ts -t "<name>"`.
- e2e needs a disposable DB, never `.env`:
```bash
docker compose -p codequest-review-test -f compose.test.yml up -d --wait  # ephemeral tmpfs on 127.0.0.1:55432
TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:55432/code_quest_test pnpm test:e2e
docker compose -p codequest-review-test -f compose.test.yml down
```
`TEST_DATABASE_URL` must end in `_test` or the suite throws. It creates a random `catalog_test_*` schema, proves migrate→revert→migrate, truncates per test, drops the schema on success (a killed run can leave `catalog_test_*` behind).

## Architecture

- Entrypoints: `src/main.ts` → `setupApp` (`src/config/setup.ts`: `setGlobalPrefix('api')`, strict `ValidationPipe{whitelist, forbidNonWhitelisted, transform}`, Helmet without CSP/COEP, credentialed CORS) → `setupSwagger` (`src/config/swagger.ts`) → `app.listen(app.port)`. `src/app.module.ts` wires `ConfigModule` (global, `envs.js`) + `TypeOrmModule.forRootAsync(databaseOptions())` + `Common/Auth/User/Questions/Catalog`.
- `src/catalog/` — public reads (`GET /courses`, `/categories`, `/technologies`, `/levels`) + admin writes (`/admin/courses`, taxonomy POST/PATCH/DELETE). `CatalogAdminGuard` (`src/catalog/guards/catalog-admin.guard.ts`) always returns `false`: admin routes are `403` on a live server; e2e overrides it via `.overrideGuard()` harness only. Never trust `X-Role` header or body `role` — tests assert both are `403`.
- `src/auth/` — JWT (`expiresIn 4h`, `JwtStrategy`, `passport-jwt`), Discord OAuth, 2FA (`otplib`, `qrcode`, `bcrypt`). `MFA_BYPASS_FOR_TESTS=true` works only with `NODE_ENV=test`.
- `src/questions/` — questionnaires/questions/answer-options CRUD. `src/user/` — users. `src/common/` — global `RateLimitGuard` (`APP_GUARD`), `GlobalExceptionFilter` (`APP_FILTER`), `HttpLoggingInterceptor` (`APP_INTERCEPTOR`), `RequestContextMiddleware` on `*`, audit-log + encryption services.
- `src/config/database.ts` registers entities + exactly 3 migrations (users/audit → catalog → questions). `src/database/migrations/` is the versioned schema; `DB_SCHEMA.txt` mirrors catalog only, rest is pending design.
- Conventions: JSON camelCase ↔ Postgres snake_case; `GET /courses` returns `{items,total,page,limit}` (default `page=1,limit=20,max 100`, order by ID); IDs bounded to `1..2147483647`; taxonomy names trimmed + case-insensitive unique (`409`); strict DTOs reject unknown fields, `null` title/arrays, duplicate IDs, cycles (`400`); drafts need only `title`, publish requires full payload + published prerequisites; archiving never deletes rows. Writes serialize on `pg_advisory_xact_lock(1789600000)`.
- Roadmap integration contract (Persona 2): import `CatalogModule`, use `getPublishedCatalog()` / `validateRoadmapSelection(ids, completedIds?)` / `getCoursesForExistingRoadmap(ids)` — see `docs/catalog.md`. `completedIds` must come from persisted progress, never the LLM.

## Style / gotchas

- Prettier: `singleQuote, trailingComma all`. Run `pnpm format` scope is `src/**/*.ts test/**/*.ts`.
- No CI (`.github/` absent), no seed, no `COURSES.txt` import. Full catalog rules + curl-shape examples live in `docs/catalog.md` — read it before touching `src/catalog/`.
