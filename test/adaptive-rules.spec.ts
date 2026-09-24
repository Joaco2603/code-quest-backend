import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import {
  validateAdaptiveQuestions,
  isQuestionVisible,
} from '../dist/questions/questionnaires/rules/adaptive-questions.js';
import { QuestionType } from '../dist/questions/questionnaires/enums/question-type.enum.js';
import { CreateQuestionDto } from '../dist/questions/questionnaires/dtos/create-question.dto.js';
import type { QuestionRulesDto } from '../dist/questions/questionnaires/dtos/question-rules.dto.js';

const parent = {
  id: 1,
  type: QuestionType.MULTIPLE_CHOICE,
  isActive: true,
  options: [{ id: 10 }],
  rules: { required: false, maxSelections: 3 },
};
const child = {
  id: 2,
  type: QuestionType.SINGLE_CHOICE,
  isActive: true,
  options: [{ id: 20 }],
  rules: { showWhen: { questionId: 1, answerOptionId: 10 } },
};

it('keeps legacy questions required and shows conditional questions only for their exact parent option', () => {
  expect(() => validateAdaptiveQuestions([parent, child])).not.toThrow();
  expect(isQuestionVisible(parent, [parent, child], [])).toBe(true);
  expect(isQuestionVisible(child, [parent, child], [])).toBe(false);
  expect(
    isQuestionVisible(
      child,
      [parent, child],
      [{ questionId: 99, answerOptionId: 10 }],
    ),
  ).toBe(false);
  expect(
    isQuestionVisible(
      child,
      [parent, child],
      [{ questionId: 1, answerOptionId: 10 }],
    ),
  ).toBe(true);
});
it('rejects cross-questionnaire references, missing options, inactive parents and conditional chains', () => {
  for (const changed of [
    { ...parent, id: 99 },
    { ...parent, options: [{ id: 99 }] },
    { ...parent, isActive: false },
    { ...parent, rules: { showWhen: { questionId: 2, answerOptionId: 20 } } },
  ])
    expect(() => validateAdaptiveQuestions([changed, child])).toThrow(
      'conditional question',
    );
  expect(() =>
    validateAdaptiveQuestions([
      { ...child, rules: { showWhen: { questionId: 2, answerOptionId: 20 } } },
    ]),
  ).toThrow();
});
it('rejects incompatible question types for selection caps and free text details', () => {
  expect(() =>
    validateAdaptiveQuestions([{ ...parent, type: QuestionType.TEXT }]),
  ).toThrow('maxSelections');
  expect(() =>
    validateAdaptiveQuestions([{ ...parent, rules: { allowDetails: true } }]),
  ).toThrow('allowDetails');
});
it.each([
  null,
  { required: null },
  { required: 'false' },
  { maxSelections: 0 },
  { maxSelections: 1.5 },
  { maxSelections: 101 },
  { showWhen: {} },
  { showWhen: { questionId: 1, answerOptionId: null } },
  { typo: true },
])('rejects malformed rules at the DTO boundary: %j', (rules) => {
  const dto = plainToInstance(CreateQuestionDto, {
    question: 'Choose technologies',
    type: 'multiple_choice',
    sortOrder: 1,
    rules,
  });
  expect(
    validateSync(dto, { whitelist: true, forbidNonWhitelisted: true }).length,
  ).toBeGreaterThan(0);
});
it.each<QuestionRulesDto>([
  {},
  { required: false, maxSelections: 3 },
  { showWhen: { questionId: 1, answerOptionId: 10 } },
])('accepts valid rules: %j', (rules) => {
  const dto = plainToInstance(CreateQuestionDto, {
    question: 'Choose technologies',
    type: 'multiple_choice',
    sortOrder: 1,
    rules,
  });
  expect(
    validateSync(dto, { whitelist: true, forbidNonWhitelisted: true }),
  ).toEqual([]);
});
