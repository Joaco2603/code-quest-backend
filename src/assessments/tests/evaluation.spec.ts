import { evaluate, revisionFor, validateDefinition } from '../evaluation.js';
import type { EvaluationDefinition } from '../interfaces/index.js';
import type { QuestionnaireResponseDto } from '../../questions/dtos/questionnaire-response.dto.js';
import { QuestionType } from '../../questions/enums/question-type.enum.js';

const questionnaire: QuestionnaireResponseDto = {
  id: 1,
  title: 'Profile',
  description: null,
  isActive: true,
  createdAt: '2026-09-21T00:00:00.000Z',
  questions: [
    {
      id: 1,
      question: 'Interests',
      type: QuestionType.MULTIPLE_CHOICE,
      options: [{ id: 10, label: 'Backend', value: null, sortOrder: 0 }],
    },
    { id: 2, question: 'Goal', type: QuestionType.TEXT, options: [] },
    {
      id: 3,
      question: 'TypeScript',
      type: QuestionType.SINGLE_CHOICE,
      options: [
        { id: 30, label: 'Beginner', value: null, sortOrder: 0 },
        { id: 31, label: 'Unknown', value: null, sortOrder: 1 },
      ],
    },
    { id: 4, question: 'Hours', type: QuestionType.NUMBER, options: [] },
    { id: 5, question: 'Experience', type: QuestionType.BOOLEAN, options: [] },
  ].map((q, i) => ({ ...q, isActive: true, sortOrder: i })),
};
const definition: EvaluationDefinition = {
  rules: [
    {
      questionId: 1,
      kind: 'category_interest',
      required: true,
      maxSelections: 1,
      options: [{ optionId: 10, value: 100 }],
    },
    {
      questionId: 2,
      kind: 'goal',
      required: true,
      maxLength: 100,
      options: [],
    },
    {
      questionId: 3,
      kind: 'self_reported_skill',
      technologyId: 200,
      required: false,
      options: [
        { optionId: 30, value: 'beginner' },
        { optionId: 31, value: null },
      ],
    },
    {
      questionId: 4,
      kind: 'none',
      required: true,
      min: 0,
      max: 40,
      options: [],
    },
    { questionId: 5, kind: 'none', required: true, options: [] },
  ],
};
const answers = [
  { questionId: 1, value: [10] },
  { questionId: 2, value: ' Build APIs ' },
  { questionId: 3, value: 30 },
  { questionId: 4, value: 0 },
  { questionId: 5, value: false },
];

it('evaluates all five types, preserves false/zero and separates interests from skills', () => {
  const result = evaluate(questionnaire, definition, answers);
  expect(result.profile).toEqual({
    interests: { categoryIds: [100], technologyIds: [] },
    goals: ['Build APIs'],
    skills: [{ technologyId: 200, level: 'beginner', source: 'self_reported' }],
    readyForGeneration: true,
  });
  expect(result.answers.slice(-2)).toEqual(answers.slice(-2));
  expect(evaluate(questionnaire, definition, [...answers].reverse())).toEqual(
    result,
  );
});
it('represents omitted optional skills and explicit unknown answers honestly', () => {
  for (const responses of [
    answers.filter((a) => a.questionId !== 3),
    answers.map((a) => (a.questionId === 3 ? { ...a, value: 31 } : a)),
  ]) {
    expect(
      evaluate(questionnaire, definition, responses).profile.skills,
    ).toEqual([{ technologyId: 200, level: null, source: 'unknown' }]);
  }
});
it.each([
  [1, [10, 10]],
  [1, []],
  [1, [999]],
  [1, 10],
  [2, '   '],
  [2, 'x'.repeat(101)],
  [2, 42],
  [3, '30'],
  [3, 999],
  [3, [30]],
  [4, '0'],
  [4, -1],
  [4, 41],
  [4, Infinity],
  [5, 'false'],
  [5, null],
])('rejects invalid answer for %s: %j', (questionId, value) => {
  expect(() =>
    evaluate(
      questionnaire,
      definition,
      answers.map((a) =>
        a.questionId === questionId ? { questionId, value } : a,
      ),
    ),
  ).toThrow();
});
it('rejects missing required, repeated and foreign questions', () => {
  expect(() => evaluate(questionnaire, definition, answers.slice(1))).toThrow(
    'Missing answer',
  );
  expect(() =>
    evaluate(questionnaire, definition, [...answers, answers[0]]),
  ).toThrow('Duplicate');
  expect(() =>
    evaluate(questionnaire, definition, [
      ...answers,
      { questionId: 99, value: true },
    ]),
  ).toThrow('foreign');
});
it('invalidates stale or malformed mappings rather than silently assigning a profile', () => {
  const removed = structuredClone(questionnaire);
  removed.questions[2].options.pop();
  expect(() => validateDefinition(removed, definition)).toThrow(
    'Map every current option',
  );
  const invalid = structuredClone(definition);
  invalid.rules[2].options[0].value = 'expert';
  expect(() => validateDefinition(questionnaire, invalid)).toThrow(
    'Unknown skill level',
  );
});
it('changes revision when questions or rule versions change', () => {
  const revision = revisionFor(questionnaire, definition, 1);
  expect(revisionFor(questionnaire, definition, 1)).toBe(revision);
  expect(revisionFor(questionnaire, definition, 2)).not.toBe(revision);
  const changed = structuredClone(questionnaire);
  changed.title = 'Changed';
  expect(revisionFor(changed, definition, 1)).not.toBe(revision);
});
it('retains incomplete optional profiles but does not enable generation', () => {
  const optional = structuredClone(definition);
  optional.rules.forEach((r) => {
    r.required = false;
  });
  const result = evaluate(questionnaire, optional, []);
  expect(result.profile.readyForGeneration).toBe(false);
  expect(result.profile.skills[0].level).toBeNull();
});
