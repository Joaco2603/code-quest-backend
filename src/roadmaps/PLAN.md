# Roadmaps — Phase 1 plan

## Goal
Students persist multiple course routes and integer progress (0–100). Catalog is a copied dependency (`origin/feature/courses`); do not redesign it or add LLM generation.

## Tables
- `roadmaps`: `id` serial PK, `title` varchar, `user_id` **uuid** (not DBML int). Index on `user_id`.
- `roadmap_courses`: `id` serial PK, `roadmap_id`, `course_id` int, `progress` int default 0, `sort_order` int NOT NULL.
  - Unique `(roadmap_id, course_id)`, unique `(roadmap_id, sort_order)`, index `course_id`.
- **Users FK:** `users` is created by TypeORM `synchronize` on this branch, not a migration. Migration **does not** `REFERENCES users(id)` so it can run against a catalog-only schema. TypeORM `ManyToOne(User, { onDelete: 'CASCADE' })` still documents ownership. Add a real FK in a later migration once users are migrated.
- **Courses FK:** `REFERENCES courses(id)` (catalog migration `1789600000000`). `ON DELETE RESTRICT` — catalog archives, it does not hard-delete.

## HTTP (`/api` prefix)
| Method | Path | Auth | Notes |
| --- | --- | --- | --- |
| POST | `/roadmaps` | `@Auth()` + JWT + 2FA | `{ title, courseIds }`; validate; `sort_order` = index; progress 0 |
| GET | `/roadmaps` | same | Current user’s roadmaps, courses hydrated |
| GET | `/roadmaps/:id` | same | Owner only → 404 otherwise |
| PATCH | `/roadmaps/:id` | same | `{ title?, courseIds? }`; replace membership if `courseIds` sent |
| PATCH | `/roadmaps/:id/courses/:courseId/progress` | same | `{ progress }` 0–100 |
| DELETE | `/roadmaps/:id` | same | Cascade `roadmap_courses` |

Duplicate / empty `courseIds`, bad title/progress → 400. Unauthenticated → 401/403. Missing or not owner → 404 (no leak).

## Catalog
- Import `CatalogModule` in `AppModule`.
- `TypeOrmModule.forFeature([Course, Category, Technology])` so `autoLoadEntities` sees catalog entities (`entities.ts` is not `*.entity.ts`).
- Leave `CatalogAdminGuard` always-deny.
- Create/replace: `validateRoadmapSelection(ids, completedIds)` with `completedIds` from **persisted** rows where `progress === 100` that remain in the new list. Create uses `[]`.
- Read: `getCoursesForExistingRoadmap(ids)` (archived OK; draft/unknown 404).
- Re-throw catalog 400/404; do not swallow.
- Writes that change courses: one TypeORM transaction; `SELECT pg_advisory_xact_lock(1789600000)` then validate then save (same lock key as catalog).

## Nest
- ESM `.js` imports. Entities `*.entity.ts`. DTOs class-validator + Swagger, camelCase.
- Scope: `user.id` UUID. No roles beyond authenticated student (`@Auth()`).
- Do not touch `synchronize`, auth/user/common config, or catalog internals except `forFeature`.

## Tests
`src/roadmaps/tests/roadmaps.service.spec.ts` — mock `CatalogService` + repos + `DataSource.transaction`. Cover create/sort_order, duplicate ids, owner 404, progress preserve, 0–100, delete, completedIds from progress 100.

## Merge risks
- Duplicate `src/catalog/` vs `feature/courses` (copy now; rebase/drop duplicate at merge).
- Duplicate `CreateCatalog` migration if both branches land.
- Users UUID vs DBML integers (this branch is source of truth).
- Catalog CLI DataSource on courses used a different `databaseOptions()`; this app uses Nest `forRoot` + `forFeature`.
