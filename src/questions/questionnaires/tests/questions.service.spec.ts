import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { vi } from 'vitest';
import { QuestionsService } from '../questions.service.js';
import { QuestionType } from '../enums/question-type.enum.js';
import type { Questionnaire } from '../entities/questionnaire.entity.js';
import type { Question } from '../entities/question.entity.js';
import type { AnswerOption } from '../entities/answer-option.entity.js';

const createdAt = new Date('2026-01-15T12:00:00.000Z');

describe('QuestionsService', () => {
  const questionnaireRepository = {
    create: vi.fn(),
    save: vi.fn(),
    findOne: vi.fn(),
    find: vi.fn(),
    findAndCount: vi.fn(),
  };
  const questionRepository = {
    create: vi.fn(),
    save: vi.fn(),
    findOne: vi.fn(),
  };
  const optionRepository = {
    create: vi.fn(),
    save: vi.fn(),
    findOne: vi.fn(),
    remove: vi.fn(),
  };

  const service = new QuestionsService(
    questionnaireRepository as never,
    questionRepository as never,
    optionRepository as never,
  );

  beforeEach(() => {
    vi.clearAllMocks();
    questionnaireRepository.create.mockImplementation(
      (data: Partial<Questionnaire>) => ({
        id: 1,
        createdAt,
        isActive: true,
        questions: [],
        ...data,
      }),
    );
    questionnaireRepository.save.mockImplementation(
      async (row: Questionnaire) => row,
    );
    questionRepository.create.mockImplementation((data: Partial<Question>) => ({
      id: 10,
      isActive: true,
      options: [],
      ...data,
    }));
    questionRepository.save.mockImplementation(async (row: Question) => row);
    optionRepository.create.mockImplementation(
      (data: Partial<AnswerOption>) => ({
        id: 100,
        value: null,
        sortOrder: 0,
        ...data,
      }),
    );
    optionRepository.save.mockImplementation(
      async (row: AnswerOption | AnswerOption[]) => {
        if (Array.isArray(row)) {
          return row.map((item, index) =>
            Object.assign({ id: 100 + index }, item),
          );
        }
        return Object.assign({ id: 100 }, row);
      },
    );
    optionRepository.remove.mockResolvedValue(undefined);
  });

  function questionnaire(
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

  function question(overrides: Partial<Question> = {}): Question {
    return {
      id: 10,
      question: 'Which languages?',
      type: QuestionType.SINGLE_CHOICE,
      isActive: true,
      sortOrder: 0,
      options: [],
      questionnaire: questionnaire(),
      ...overrides,
    } as Question;
  }

  function option(overrides: Partial<AnswerOption> = {}): AnswerOption {
    return {
      id: 100,
      label: 'JavaScript',
      value: 'js',
      sortOrder: 0,
      isActive: true,
      ...overrides,
    } as AnswerOption;
  }

  it('creates a questionnaire', async () => {
    const created = await service.createQuestionnaire({
      title: 'Skills intake',
      description: 'Path finder',
    });

    expect(created).toMatchObject({
      id: 1,
      title: 'Skills intake',
      description: 'Path finder',
      isActive: true,
      questions: [],
    });
    expect(questionnaireRepository.save).toHaveBeenCalled();
  });

  it('creates a choice question with options', async () => {
    questionnaireRepository.findOne.mockResolvedValue(questionnaire());

    const created = await service.createQuestion(1, {
      question: 'Which languages?',
      type: QuestionType.SINGLE_CHOICE,
      sortOrder: 0,
      options: [
        { label: 'JavaScript', value: 'js', sortOrder: 1 },
        { label: 'Python', sortOrder: 0 },
      ],
    });

    expect(created.options.map((item: AnswerOption) => item.label)).toEqual([
      'Python',
      'JavaScript',
    ]);
    expect(optionRepository.save).toHaveBeenCalled();
  });

  it('creates a boolean question without options', async () => {
    questionnaireRepository.findOne.mockResolvedValue(questionnaire());

    const created = await service.createQuestion(1, {
      question: 'Have you used TypeScript?',
      type: QuestionType.BOOLEAN,
      sortOrder: 1,
    });

    expect(created.type).toBe(QuestionType.BOOLEAN);
    expect(created.options).toEqual([]);
    expect(optionRepository.save).not.toHaveBeenCalled();
  });

  it('rejects options on non-choice types', async () => {
    questionnaireRepository.findOne.mockResolvedValue(questionnaire());

    await expect(
      service.createQuestion(1, {
        question: 'Years of experience',
        type: QuestionType.NUMBER,
        sortOrder: 0,
        options: [{ label: '1' }],
      }),
    ).rejects.toThrow(BadRequestException);

    questionRepository.findOne.mockResolvedValue(
      question({ type: QuestionType.TEXT }),
    );

    await expect(service.createOption(10, { label: 'Nope' })).rejects.toThrow(
      BadRequestException,
    );
  });

  it('hides inactive questionnaires and questions from students', async () => {
    questionnaireRepository.find.mockResolvedValue([questionnaire({ id: 1 })]);

    const listed = await service.listActiveQuestionnaires();
    expect(listed).toHaveLength(1);
    expect(listed[0].id).toBe(1);
    expect(questionnaireRepository.find).toHaveBeenCalledWith(
      expect.objectContaining({ where: { isActive: true } }),
    );

    questionnaireRepository.findOne.mockResolvedValue(
      questionnaire({ isActive: false }),
    );
    await expect(service.getActiveQuestionnaire(1)).rejects.toThrow(
      NotFoundException,
    );

    questionnaireRepository.findOne.mockResolvedValue(
      questionnaire({
        questions: [
          question({
            id: 10,
            isActive: true,
            sortOrder: 1,
            options: [option()],
          }),
          question({
            id: 11,
            isActive: false,
            sortOrder: 0,
            question: 'Inactive',
            options: [option({ id: 101 })],
          }),
        ],
      }),
    );

    const detail = await service.getActiveQuestionnaire(1);
    expect(detail.questions.map((item: Question) => item.id)).toEqual([10]);
  });

  it('lets admins see inactive questions', async () => {
    questionnaireRepository.findOne.mockResolvedValue(
      questionnaire({
        questions: [
          question({
            id: 11,
            isActive: false,
            sortOrder: 0,
            options: [],
            type: QuestionType.TEXT,
          }),
          question({
            id: 10,
            isActive: true,
            sortOrder: 1,
            options: [option()],
          }),
        ],
      }),
    );

    const detail = await service.getQuestionnaireForAdmin(1);
    expect(detail.questions.map((item: Question) => item.id)).toEqual([11, 10]);
  });

  it('orders questions and options by sortOrder then id', async () => {
    questionnaireRepository.findOne.mockResolvedValue(
      questionnaire({
        questions: [
          question({
            id: 12,
            sortOrder: 2,
            options: [
              option({ id: 103, label: 'C', sortOrder: 2 }),
              option({ id: 101, label: 'A', sortOrder: 0 }),
              option({ id: 102, label: 'B', sortOrder: 0 }),
            ],
          }),
          question({
            id: 10,
            sortOrder: 1,
            options: [option({ id: 100, label: 'Only' })],
          }),
        ],
      }),
    );

    const detail = await service.getActiveQuestionnaire(1);
    expect(detail.questions.map((item: Question) => item.id)).toEqual([10, 12]);
    expect(
      detail.questions[1].options.map((item: AnswerOption) => item.id),
    ).toEqual([101, 102, 103]);
  });

  it('returns the other questions when one choice question has no active options', async () => {
    questionnaireRepository.findOne.mockResolvedValue(
      questionnaire({
        questions: [
          question({ id: 10, sortOrder: 0, options: [] }),
          question({
            id: 12,
            sortOrder: 1,
            type: QuestionType.TEXT,
            options: [],
          }),
        ],
      }),
    );

    const detail = await service.getActiveQuestionnaire(1);
    expect(detail.questions.map((item: { id: number }) => item.id)).toEqual([
      10, 12,
    ]);
  });

  it('rejects student fetch of a choice question with no options', async () => {
    questionnaireRepository.findOne.mockResolvedValue(
      questionnaire({
        questions: [question({ options: [] })],
      }),
    );

    await expect(service.getActiveQuestionnaire(1)).rejects.toThrow(
      ConflictException,
    );
  });

  it('returns 404 for unknown ids', async () => {
    questionnaireRepository.findOne.mockResolvedValue(null);
    questionRepository.findOne.mockResolvedValue(null);
    optionRepository.findOne.mockResolvedValue(null);

    await expect(service.getActiveQuestionnaire(99)).rejects.toThrow(
      NotFoundException,
    );
    await expect(service.getQuestionnaireForAdmin(99)).rejects.toThrow(
      NotFoundException,
    );
    await expect(service.updateQuestion(99, { question: 'x' })).rejects.toThrow(
      NotFoundException,
    );
    await expect(service.deleteOption(99)).rejects.toThrow(NotFoundException);
  });

  it('soft-deactivates questionnaires and questions', async () => {
    questionnaireRepository.findOne.mockResolvedValue(questionnaire());
    const deactivated = await service.deactivateQuestionnaire(1);
    expect(deactivated).toEqual({
      message: 'Questionnaire deactivated',
      id: 1,
    });
    expect(questionnaireRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({ isActive: false }),
    );

    questionRepository.findOne.mockResolvedValue(question());
    await service.deactivateQuestion(10);
    expect(questionRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({ isActive: false }),
    );

    optionRepository.findOne.mockResolvedValue(option());
    const deactivatedOption = await service.deleteOption(100);
    expect(deactivatedOption).toEqual({
      message: 'Answer option deactivated',
      id: 100,
    });
    expect(optionRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({ isActive: false }),
    );
    expect(optionRepository.remove).not.toHaveBeenCalled();
  });

  it('hides inactive options from students and keeps them for attempts', async () => {
    const active = option({ id: 1, isActive: true });
    const retired = option({ id: 2, isActive: false, label: 'Retired' });
    questionnaireRepository.findOne.mockResolvedValue(
      questionnaire({
        questions: [question({ options: [active, retired] })],
      }),
    );

    const studentView = await service.getActiveQuestionnaire(1);
    expect(
      studentView.questions[0].options.map((item: { id: number }) => item.id),
    ).toEqual([1]);

    const attempt = await service.getQuestionnaireForAttempt(1);
    expect(
      attempt.questions[0].options.map((item: { id: number }) => item.id),
    ).toEqual([1, 2]);
  });

  it('returns an inactive questionnaire for an existing attempt', async () => {
    questionnaireRepository.findOne.mockResolvedValue(
      questionnaire({
        isActive: false,
        questions: [question({ options: [option()] })],
      }),
    );

    const attempt = await service.getQuestionnaireForAttempt(1);
    expect(attempt.isActive).toBe(false);
  });

  it('allows a type change when every option is inactive', async () => {
    questionRepository.findOne.mockResolvedValue(
      question({ options: [option({ isActive: false })] }),
    );
    questionRepository.save.mockImplementation(async (row: Question) => row);

    const updated = await service.updateQuestion(10, {
      type: QuestionType.TEXT,
    });

    expect(updated.type).toBe(QuestionType.TEXT);
  });

  it('blocks incompatible type changes when options exist', async () => {
    questionRepository.findOne.mockResolvedValue(
      question({ options: [option()] }),
    );

    await expect(
      service.updateQuestion(10, { type: QuestionType.TEXT }),
    ).rejects.toThrow(ConflictException);
  });

  it('asserts a question belongs to a questionnaire', async () => {
    questionRepository.findOne.mockResolvedValue(
      question({
        questionnaire: questionnaire({ id: 1 }),
        options: [option()],
      }),
    );

    const found = await service.assertQuestionInQuestionnaire(1, 10);
    expect(found.id).toBe(10);

    await expect(service.assertQuestionInQuestionnaire(2, 10)).rejects.toThrow(
      NotFoundException,
    );
  });
});
