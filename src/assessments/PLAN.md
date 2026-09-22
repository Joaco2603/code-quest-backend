# Assessments module plan

## Goal

Record a student’s questionnaire **attempts** (`assessments`) and typed **answers** (`user_responses`) without owning questionnaire/question/option CRUD. Questions live on `feat/questions`. This branch must merge independently.

## Lifecycle

1. **Start** (`POST /assessments`) — authenticated student, `{ questionnaireId }`.
   - Load via `QuestionsService.getActiveQuestionnaire`.
   - Missing or inactive questionnaire → **404** (same as “not available”).
   - **Decision:** at most one **incomplete** assessment per `(user_id, questionnaire_id)`. A second start → **409**. Completed attempts may be started again (history).
2. **Answer** (`PUT /assessments/:id/responses`) — upsert one question’s rows. Completed assessment → **409**.
3. **Complete** (`POST /assessments/:id/complete`) — set `completed_at` only when every **active** question has a valid stored answer. Incomplete → **400**. Already complete → **409**.
4. **Read** — list mine; get one with responses. Non-owner or missing → **404** (no existence leak).

Writes never mutate completed assessments.

## Response storage (no unique on `(assessment_id, question_id)`)

`multiple_choice` stores **one row per selected option**. Upsert always: delete rows for `(assessment_id, question_id)`, then insert.

| Type | Request | Stored rows |
|------|---------|-------------|
| `single_choice` | exactly one `answerOptionId` **or** one-element `answerOptionIds`; option must belong to the question | 1 row: `answer_option_id` set, `value` null |
| `multiple_choice` | non-empty unique `answerOptionIds` (all belong to question) | N rows: one per option, `value` null |
| `text` | non-empty trimmed `value`; no option ids | 1 row: `answer_option_id` null, `value` trimmed |
| `number` | `value` parses as finite number | 1 row: canonical `String(Number(value))` |
| `boolean` | `true`/`false` or `"true"`/`"false"` | 1 row: `'true'` or `'false'` |

Inactive questions: **cannot be answered** (400). They are **ignored for completion**. Question must belong to the assessment’s `questionnaire_id`.

## Ownership and auth

- Same stack as `UserController`: `@Auth(ValidRoles.user)` + `JwtAuthGuard` + `TwoFactorGuard`.
- Students only (`user` role). Owner is `assessments.user_id === jwt.sub`.
- `User.id` is UUID → `assessments.user_id` is `uuid`.

## Questions

`AssessmentsModule` imports `QuestionsModule` and calls `QuestionsService.getActiveQuestionnaire`. That method already returns only active questions. Unit tests mock the service.

## Persistence

- Entities: `Assessment`, `UserResponse`. `ManyToOne` User `CASCADE`. Integer columns for questionnaire/question/option (no Question entity import).
- Migration `1789600002000-CreateAssessments.ts`: indexes on `user_id`, `questionnaire_id`, `assessment_id`, `question_id`. FK to `users` with CASCADE, responses → assessments with CASCADE, and RESTRICT FKs to `questionnaires`, `questions`, and `answer_options`.
- Do not change global `synchronize`.

## Tests

Mock `QuestionsService` + repositories: start; validation happy/reject per type; multiple_choice N rows + replace; complete blocked then `completed_at`; further PUT 409; owner 404; inactive questionnaire cannot start; duplicate incomplete 409.

## Merge risks

- Column names (`is_active` vs `isActive`) on questions tables.
- Snapshot field names vs questions agent.
- Duplicate incomplete-assessment rule if product wants retries in-progress.
- Adding FKs after both migrations exist (order: questions tables first).
