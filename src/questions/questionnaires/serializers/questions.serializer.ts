import type { AnswerOption } from '../entities/answer-option.entity.js';
import type { Question } from '../entities/question.entity.js';
import type { Questionnaire } from '../entities/questionnaire.entity.js';
import type {
  AnswerOptionResponseDto,
  QuestionResponseDto,
  QuestionnaireResponseDto,
} from '../dtos/questionnaire-response.dto.js';

function toIsoUtc(value: Date | string): string {
  if (value instanceof Date) return value.toISOString();
  return new Date(value).toISOString();
}

function bySortThenId(
  a: { sortOrder: number; id: number },
  b: { sortOrder: number; id: number },
): number {
  return a.sortOrder - b.sortOrder || a.id - b.id;
}

/**
 * Explicit questionnaire serializers (Etapa 4).
 * They reuse the previous `toQuestionnaireDetail` / `toQuestionDetail`
 * selection: explicit fields only, options/questions ordered by
 * `sortOrder` then `id`, `value ?? null`, `description ?? null`, dates as
 * ISO 8601 UTC. No entity spreads, so extra source props never leak.
 */
export function serializeAnswerOption(
  source: AnswerOption,
): AnswerOptionResponseDto {
  return {
    id: source.id,
    label: source.label,
    value: source.value ?? null,
    sortOrder: source.sortOrder,
  };
}

export function serializeQuestion(source: Question): QuestionResponseDto {
  const options = [...(source.options ?? [])]
    .sort(bySortThenId)
    .map((option) => serializeAnswerOption(option));

  return {
    id: source.id,
    question: source.question,
    type: source.type,
    isActive: source.isActive,
    sortOrder: source.sortOrder,
    options,
  };
}

export function serializeQuestionnaire(
  source: Questionnaire,
  activeQuestionsOnly = false,
): QuestionnaireResponseDto {
  const questions = (source.questions ?? [])
    .filter((question) => !activeQuestionsOnly || question.isActive)
    .sort(bySortThenId)
    .map((question) => serializeQuestion(question));

  return {
    id: source.id,
    title: source.title,
    description: source.description ?? null,
    isActive: source.isActive,
    createdAt: toIsoUtc(source.createdAt),
    questions,
  };
}

export function serializeQuestionnaires(
  sources: Questionnaire[],
  activeQuestionsOnly = false,
): QuestionnaireResponseDto[] {
  return sources.map((source) =>
    serializeQuestionnaire(source, activeQuestionsOnly),
  );
}
