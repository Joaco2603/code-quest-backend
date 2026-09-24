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

- Entrypoints: `src/main.ts` → `setupApp` (`src/config/setup.ts`: `setGlobalPrefix('api')`, strict `ValidationPipe{whitelist, forbidNonWhitelisted, transform}`, Helmet without CSP/COEP, credentialed CORS) → `setupSwagger` (`src/config/swagger.ts`) → `app.listen(app.port)`. `src/app.module.ts` wires `ConfigModule` (global, `envs.js`) + `TypeOrmModule.forRootAsync(databaseOptions())` + `Common/Auth/User/Questions/Catalog/Assessments/Roadmaps/Health` (Observe telemetry disabled until credentials exist).
- `src/catalog/` — public reads (`GET /courses`, `/categories`, `/technologies`, `/levels`) + admin writes (`/admin/courses`, taxonomy POST/PATCH/DELETE). `CatalogAdminGuard` (`src/catalog/guards/catalog-admin.guard.ts`) verifies JWT via Passport, loads the role from DB and requires a full `admin` session (rejects recovery/`mustChangePassword`/2FA-temporary). Never trust `X-Role` header or body `role` — tests assert both are `403`.
- `src/auth/` — JWT (`expiresIn 4h`, `JwtStrategy`, `passport-jwt`), Discord OAuth, 2FA (`otplib`, `qrcode`, `bcrypt`). `MFA_BYPASS_FOR_TESTS=true` works only with `NODE_ENV=test`.
- `src/questions/` — questionnaires/questions/answer-options CRUD. The old `src/questions/assessments/` module was deleted (PR22) and its tables dropped by `DropLegacyAssessments` (no history kept). `src/assessments/` is the current flow: `PUT /questionnaires/:id/evaluation` (admin config), `GET` form + revision, `POST /assessments` single-shot submit, owned list/get. `src/roadmaps/` — user CRUD + `POST /roadmaps/generate` (OpenAI over published catalog, `OPENAI_API_KEY` required at runtime, gracefully `503` when missing). `src/seed/content/` — explicit course import (`pnpm content:import COURSES.enriched.json [--apply]`, draft-only, flat curated `level`/`technologyNames`, never copies `imageUrl`/`durationMinutes`). `src/user/` — users. `src/common/` — global `RateLimitGuard` (`APP_GUARD`), `GlobalExceptionFilter` (`APP_FILTER`), `HttpLoggingInterceptor` (`APP_INTERCEPTOR`), `RequestContextMiddleware` on `*`, audit-log + encryption services.
- `src/config/database.ts` registers entities + 13 migrations (users/audit → catalog → questions → old assessments → old rename → old roadmaps → adaptive → new assessments → content-imports → new rename → roadmaps-AI-columns → deactivate-adaptive-questionnaire → drop-legacy-assessments). `src/database/migrations/` is the versioned schema; `DB_SCHEMA.txt` mirrors the initial design only, not all migrations.
- Conventions: JSON camelCase ↔ Postgres snake_case; services return raw data or `{items,total,limit,offset}` and NEVER wrap; controllers wrap exactly once (`toDataResponse` → `{data}`, `toPaginatedResponse` → `{data,meta:{total,limit,offset}}`); default `limit=20,max 100`, order by ID; IDs bounded to `1..2147483647`; taxonomy names trimmed + case-insensitive unique (`409`); strict DTOs reject unknown fields, `null` title/arrays, duplicate IDs, cycles (`400`); drafts need only `title`, publish requires full payload + published prerequisites; archiving never deletes rows. Writes serialize on `pg_advisory_xact_lock(1789600000)`.
- Roadmap integration contract (Persona 2): import `CatalogModule`, use `getPublishedCatalog()` / `validateRoadmapSelection(ids, completedIds?)` / `getCoursesForExistingRoadmap(ids)` — see `docs/catalog.md`. `completedIds` must come from persisted progress, never the LLM.

## Style / gotchas

- Prettier: `singleQuote, trailingComma all`. Run `pnpm format` scope is `src/**/*.ts test/**/*.ts`.
- No CI (`.github/` absent), no seed data committed besides `COURSES.enriched.json` (explicit import only, never on boot). Full catalog rules + curl-shape examples live in `docs/catalog.md` — read it before touching `src/catalog/`.
