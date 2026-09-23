import { QuestionType } from '../enums/question-type.enum.js';
import type { Questionnaire } from '../entities/questionnaire.entity.js';
import type { Question } from '../entities/question.entity.js';
import type { AnswerOption } from '../entities/answer-option.entity.js';
import {
  serializeAnswerOption,
  serializeQuestion,
  serializeQuestionnaire,
} from '../serializers/questions.serializer.js';

const createdAt = new Date('2026-01-15T12:00:00.000Z');

function buildQuestionnaire(
  overrides: Partial<Questionnaire> = {},
): Questionnaire {
  return {
    id: 1,
    title: 'Skills intake',
    description: 'Path finder',
    isActive: true,
    createdAt,
    questions: [],
    ...overrides,
  } as Questionnaire;
}

function buildQuestion(overrides: Partial<Question> = {}): Question {
  return {
    id: 10,
    question: 'Which languages?',
    type: QuestionType.SINGLE_CHOICE,
    isActive: true,
    sortOrder: 0,
    options: [],
    questionnaire: buildQuestionnaire(),
    ...overrides,
  } as Question;
}

describe('questions serializers', () => {
  it('serializes a questionnaire with exact fields and ISO dates', () => {
    const detail = serializeQuestionnaire(
      buildQuestionnaire({ questions: [buildQuestion()] }),
    );

    expect(detail).toEqual({
      id: 1,
      title: 'Skills intake',
      description: 'Path finder',
      isActive: true,
      createdAt: '2026-01-15T12:00:00.000Z',
      questions: [
        {
          id: 10,
          rules: { required: true },
          question: 'Which languages?',
          type: QuestionType.SINGLE_CHOICE,
          isActive: true,
          sortOrder: 0,
          options: [],
        },
      ],
    });
  });

  it('ignores extra properties on sources and nested relations', () => {
    const source = Object.assign(buildQuestionnaire(), {
      leakedInternalFlag: true,
      questions: [
        Object.assign(buildQuestion(), {
          secret: 'hidden',
          options: [
            {
              id: 100,
              label: 'JavaScript',
              value: 'js',
              sortOrder: 0,
              extra: 'leak',
            } as unknown as AnswerOption,
          ],
        }),
      ],
    });

    const detail = serializeQuestionnaire(source);

    expect(detail).not.toHaveProperty('leakedInternalFlag');
    expect(detail.questions[0]).not.toHaveProperty('secret');
    expect(detail.questions[0].options[0]).not.toHaveProperty('extra');
    expect(JSON.stringify(detail)).not.toContain('hidden');
    expect(JSON.stringify(detail)).not.toContain('leak');
  });

  it('orders questions and options by sortOrder then id', () => {
    const detail = serializeQuestionnaire(
      buildQuestionnaire({
        questions: [
          buildQuestion({
            id: 12,
            sortOrder: 2,
            options: [
              { id: 103, label: 'C', value: 'c', sortOrder: 2 },
              { id: 101, label: 'A', value: 'a', sortOrder: 0 },
              { id: 102, label: 'B', value: 'b', sortOrder: 0 },
            ] as AnswerOption[],
          }),
          buildQuestion({ id: 10, sortOrder: 1, options: [] }),
        ],
      }),
    );

    expect(detail.questions.map((item) => item.id)).toEqual([10, 12]);
    expect(detail.questions[1].options.map((item) => item.id)).toEqual([
      101, 102, 103,
    ]);
  });

  it('normalizes missing values to null', () => {
    const option = serializeAnswerOption({
      id: 100,
      label: 'Python',
      value: undefined as unknown as null,
      sortOrder: 0,
    } as AnswerOption);

    expect(option.value).toBeNull();

    const questionnaire = serializeQuestionnaire(
      buildQuestionnaire({
        description: undefined as unknown as null,
        questions: [],
      }),
    );
    expect(questionnaire.description).toBeNull();

    const question = serializeQuestion(
      buildQuestion({ options: undefined as unknown as AnswerOption[] }),
    );
    expect(question.options).toEqual([]);
  });

  it('filters inactive questions only for student snapshots', () => {
    const source = buildQuestionnaire({
      questions: [
        buildQuestion({ id: 10, isActive: true, sortOrder: 1 }),
        buildQuestion({
          id: 11,
          isActive: false,
          sortOrder: 0,
          question: 'Inactive',
          type: QuestionType.TEXT,
        }),
      ],
    });

    expect(
      serializeQuestionnaire(source, true).questions.map((item) => item.id),
    ).toEqual([10]);
    expect(
      serializeQuestionnaire(source, false).questions.map((item) => item.id),
    ).toEqual([11, 10]);
  });
});
