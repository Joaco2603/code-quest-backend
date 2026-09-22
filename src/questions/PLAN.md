# Questions module plan

Admins author questionnaires; students (any authenticated user) read **active** questionnaires with **active** questions and ordered options. The answers module will import `QuestionsService` after merge — not HTTP.

## Quick path

1. Persist `questionnaires` → `questions` → `answer_options` (serial ints, `question_type` enum).
2. Admin CRUD on `/api/questionnaires`, `/api/questions`, `/api/answer-options`.
3. Students: `GET /api/questionnaires/active` and `GET /api/questionnaires/active/:id`.
4. Export `getActiveQuestionnaire`, `getQuestionnaireForAdmin`, `assertQuestionInQuestionnaire`.

## Scope

| In | Out |
|----|-----|
| Questionnaires, questions, answer options | Catalog, courses, roadmaps, assessments |
| Auth via existing JWT + 2FA guards | `user_responses` / scoring (answers agent) |
| Soft-deactivate questionnaires & questions | `user_technologies` |

## Domain

| Topic | Decision |
|-------|----------|
| IDs | `SERIAL` integers (catalog-style), not UUID |
| Types | `single_choice`, `multiple_choice`, `text`, `number`, `boolean` |
| `sort_order` | Required on questions. Options default to `0`. No unique constraint; order by `sort_order`, then `id` |
| Choice options | Admin may create a choice question with zero options. **Student fetch** of an active questionnaire **409** if any **active** choice question has zero options |
| Non-choice options | `text` / `number` / `boolean` reject option payloads with **400**. Boolean may have zero options |
| Empty strings | Trim titles, question text, labels; reject empty after trim |
| Option `value` | Optional; answers module may use option `id` |
| Type change | Choice → non-choice while options exist → **409** (delete options first). Choice ↔ choice is allowed |
| Delete questionnaire / question | **Soft**: `is_active = false` (responses may exist later) |
| Delete option | **Hard** (no `is_active` column); FK `ON DELETE CASCADE` from question |

## HTTP (prefix `/api`)

Declare `active` routes **before** `:id`.

| Method | Path | Auth |
|--------|------|------|
| POST | `/questionnaires` | admin |
| GET | `/questionnaires` | admin; `PaginationDto` + optional `isActive` |
| GET | `/questionnaires/active` | any authenticated |
| GET | `/questionnaires/active/:id` | any authenticated; active questions + options only |
| GET | `/questionnaires/:id` | admin; includes inactive questions |
| PATCH | `/questionnaires/:id` | admin |
| DELETE | `/questionnaires/:id` | admin; soft-deactivate |
| POST | `/questionnaires/:id/questions` | admin |
| PATCH | `/questions/:id` | admin |
| DELETE | `/questions/:id` | admin; soft-deactivate |
| POST | `/questions/:id/options` | admin |
| PATCH | `/answer-options/:id` | admin |
| DELETE | `/answer-options/:id` | admin; hard delete |

## Export contract (answers agent)

`QuestionsModule` exports `QuestionsService`:

```ts
getActiveQuestionnaire(id: number): Promise<QuestionnaireDetail> // 404 missing/inactive; 409 choice with no options
getQuestionnaireForAdmin(id: number): Promise<QuestionnaireDetail> // 404 missing only
assertQuestionInQuestionnaire(questionnaireId: number, questionId: number): Promise<QuestionDetail>
```

JSON snapshot (camelCase): `{ id, title, description, isActive, createdAt, questions: [{ id, question, type, isActive, sortOrder, options: [{ id, label, value, sortOrder }] }] }`.

Student snapshot omits inactive questions. Options always ordered.

Import after merge: `QuestionsModule` + `QuestionsService` from `src/questions/`. Types from `src/questions/interfaces/`.

## Persistence

Migration `1789600001000-CreateQuestions.ts`: enum + three tables + FKs `ON DELETE CASCADE`. Indexes `(questionnaire_id, sort_order)`, `(questionnaire_id, is_active)`, `question_id` on options. Do not change `synchronize`. No catalog FKs.

## Tests

Unit tests, mocked repos, in `src/questions/tests/*.spec.ts`: create flows, student hide inactive, 409 empty choice on student fetch, 400 options on non-choice, admin vs student visibility, sort order, 404s.

## Merge risks

- Branch base is `feat/auth-user` @ `0959432`. Discord WIP in the original dirty tree must not land here.
- Answers agent must not duplicate these tables.
- Route clash: `GET questionnaires/active` vs `:id` — static path first.
- Enum `question_type` name must stay unique in Postgres if catalog later adds types.
