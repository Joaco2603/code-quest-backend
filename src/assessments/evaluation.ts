import { BadRequestException, ConflictException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { SkillLevel } from '../catalog/entities.js';
import {
  QuestionType,
  isChoiceQuestionType,
} from '../questions/enums/question-type.enum.js';
import type { QuestionnaireResponseDto } from '../questions/dtos/questionnaire-response.dto.js';
import type {
  AnswerValue,
  EvaluationDefinition,
  ProfileResult,
  QuestionRule,
} from './interfaces/index.js';

export function revisionFor(
  questionnaire: QuestionnaireResponseDto,
  definition: EvaluationDefinition,
  version: number,
): string {
  return createHash('sha256')
    .update(JSON.stringify({ questionnaire, definition, version }))
    .digest('hex');
}
const positiveId = (value: unknown): value is number =>
  Number.isInteger(value) && Number(value) > 0 && Number(value) <= 2147483647;
const unique = <T>(values: T[]) => new Set(values).size === values.length;

// Semantic validation is shared by configuration writes and submission. Changes
// to a questionnaire invalidate stale mappings instead of silently changing scores.
export function validateDefinition(
  questionnaire: QuestionnaireResponseDto,
  definition: EvaluationDefinition,
) {
  const { rules } = definition;
  if (
    !questionnaire.questions.length ||
    rules.length !== questionnaire.questions.length ||
    !unique(rules.map((r) => r.questionId))
  ) {
    throw new ConflictException(
      'Configure exactly one rule per active question',
    );
  }
  const skillTechnologies: number[] = [];
  for (const rule of rules) {
    const question = questionnaire.questions.find(
      (q) => q.id === rule.questionId,
    );
    if (!question)
      throw new ConflictException(
        'Rule refers to an inactive or missing question',
      );
    const choice = isChoiceQuestionType(question.type);
    if (choice && !question.options.length)
      throw new ConflictException('Choice questions require answer options');
    if (rule.min !== undefined && rule.max !== undefined && rule.min > rule.max)
      throw new BadRequestException('Invalid numeric range');
    if (
      (rule.min !== undefined || rule.max !== undefined) &&
      question.type !== QuestionType.NUMBER
    )
      throw new BadRequestException('Numeric bounds require a number question');
    if (rule.maxLength !== undefined && question.type !== QuestionType.TEXT)
      throw new BadRequestException('maxLength requires a text question');
    if (
      rule.maxSelections !== undefined &&
      question.type !== QuestionType.MULTIPLE_CHOICE
    )
      throw new BadRequestException('maxSelections requires multiple choice');
    if (!choice && rule.options.length)
      throw new BadRequestException('Non-choice questions cannot map options');
    if (rule.kind === 'none' && rule.options.length)
      throw new BadRequestException(
        'Unmapped questions must have empty mappings',
      );
    if (rule.kind !== 'self_reported_skill' && rule.technologyId !== undefined)
      throw new BadRequestException('technologyId is only allowed for skills');
    if (
      rule.kind !== 'none' &&
      !choice &&
      !(rule.kind === 'goal' && question.type === QuestionType.TEXT)
    )
      throw new BadRequestException(
        'Profile rules require choice questions or a text goal',
      );
    if (rule.kind === 'self_reported_skill') {
      if (
        !positiveId(rule.technologyId) ||
        question.type !== QuestionType.SINGLE_CHOICE
      )
        throw new BadRequestException(
          'A skill requires a technology and single choice',
        );
      skillTechnologies.push(rule.technologyId);
    }
    if (choice && rule.kind !== 'none') {
      if (
        !question.options.length ||
        rule.options.length !== question.options.length ||
        !unique(rule.options.map((o) => o.optionId)) ||
        rule.options.some(
          (o) => !question.options.some((q) => q.id === o.optionId),
        )
      )
        throw new ConflictException('Map every current option exactly once');
      for (const option of rule.options) {
        if (
          ['category_interest', 'technology_interest'].includes(rule.kind) &&
          !positiveId(option.value)
        )
          throw new BadRequestException(
            'Interest mappings require catalog IDs',
          );
        if (
          rule.kind === 'goal' &&
          (typeof option.value !== 'string' ||
            !option.value.trim() ||
            option.value.length > 2000)
        )
          throw new BadRequestException('Goal mappings require nonempty text');
        if (
          rule.kind === 'self_reported_skill' &&
          option.value !== null &&
          !Object.values(SkillLevel).includes(option.value as SkillLevel)
        )
          throw new BadRequestException('Unknown skill level');
      }
    }
  }
  if (!unique(skillTechnologies))
    throw new BadRequestException(
      'Configure only one skill question per technology',
    );
}

export function taxonomyReferences(definition: EvaluationDefinition) {
  const categories = new Set<number>();
  const technologies = new Set<number>();
  for (const rule of definition.rules) {
    if (rule.technologyId) technologies.add(rule.technologyId);
    for (const option of rule.options) {
      if (rule.kind === 'category_interest')
        categories.add(option.value as number);
      if (rule.kind === 'technology_interest')
        technologies.add(option.value as number);
    }
  }
  return { categoryIds: [...categories], technologyIds: [...technologies] };
}

function normalizeAnswer(
  type: QuestionType,
  value: unknown,
  optionIds: number[],
  rule: QuestionRule,
): AnswerValue {
  const invalid = () => {
    throw new BadRequestException(
      `Invalid answer for question ${rule.questionId}`,
    );
  };
  switch (type) {
    case QuestionType.SINGLE_CHOICE:
      if (!positiveId(value) || !optionIds.includes(value)) return invalid();
      return value;
    case QuestionType.MULTIPLE_CHOICE:
      if (
        !Array.isArray(value) ||
        !value.length ||
        value.length > (rule.maxSelections ?? 100) ||
        !unique(value) ||
        value.some((id) => !positiveId(id) || !optionIds.includes(id))
      )
        return invalid();
      return [...value].sort((a, b) => a - b) as number[];
    case QuestionType.TEXT:
      if (
        typeof value !== 'string' ||
        !value.trim() ||
        value.trim().length > (rule.maxLength ?? 2000)
      )
        return invalid();
      return value.trim();
    case QuestionType.NUMBER:
      if (
        typeof value !== 'number' ||
        !Number.isFinite(value) ||
        (rule.min !== undefined && value < rule.min) ||
        (rule.max !== undefined && value > rule.max)
      )
        return invalid();
      return value;
    case QuestionType.BOOLEAN:
      if (typeof value !== 'boolean') return invalid();
      return value;
  }
}

export function evaluate(
  questionnaire: QuestionnaireResponseDto,
  definition: EvaluationDefinition,
  answers: Array<{ questionId: number; value: unknown }>,
) {
  validateDefinition(questionnaire, definition);
  if (!unique(answers.map((a) => a.questionId)))
    throw new BadRequestException('Duplicate question answers');
  if (
    answers.some(
      (a) => !questionnaire.questions.some((q) => q.id === a.questionId),
    )
  )
    throw new BadRequestException(
      'Answer refers to an inactive or foreign question',
    );
  const normalized: Array<{ questionId: number; value: AnswerValue }> = [];
  const categories = new Set<number>();
  const technologies = new Set<number>();
  const goals = new Set<string>();
  const skills: ProfileResult['skills'] = [];
  for (const question of questionnaire.questions) {
    const rule = definition.rules.find((r) => r.questionId === question.id)!;
    const answer = answers.find((a) => a.questionId === question.id);
    if (!answer) {
      if (rule.required)
        throw new BadRequestException(
          `Missing answer for question ${question.id}`,
        );
      if (rule.kind === 'self_reported_skill')
        skills.push({
          technologyId: rule.technologyId!,
          level: null,
          source: 'unknown',
        });
      continue;
    }
    const value = normalizeAnswer(
      question.type,
      answer.value,
      question.options.map((o) => o.id),
      rule,
    );
    normalized.push({ questionId: question.id, value });
    if (rule.kind === 'none') continue;
    if (rule.kind === 'goal' && question.type === QuestionType.TEXT) {
      goals.add(value as string);
      continue;
    }
    for (const id of Array.isArray(value) ? value : [value]) {
      const mapped = rule.options.find((o) => o.optionId === id)!.value;
      if (rule.kind === 'category_interest') categories.add(mapped as number);
      if (rule.kind === 'technology_interest')
        technologies.add(mapped as number);
      if (rule.kind === 'goal') goals.add((mapped as string).trim());
      if (rule.kind === 'self_reported_skill')
        skills.push({
          technologyId: rule.technologyId!,
          level: mapped as SkillLevel | null,
          source: mapped === null ? 'unknown' : 'self_reported',
        });
    }
  }
  const profile: ProfileResult = {
    interests: {
      categoryIds: [...categories].sort((a, b) => a - b),
      technologyIds: [...technologies].sort((a, b) => a - b),
    },
    goals: [...goals].sort(),
    skills: skills.sort((a, b) => a.technologyId - b.technologyId),
    readyForGeneration:
      (categories.size > 0 || technologies.size > 0) && goals.size > 0,
  };
  return { answers: normalized, profile };
}
