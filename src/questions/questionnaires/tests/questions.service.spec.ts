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

  function questionnaire(overrides: Partial<Questionnaire> = {}): Questionnaire {
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
      ...overrides,
    } as AnswerOption;
  }

  it('derives offset from page so page=2 lands on the second page', async () => {
    questionnaireRepository.findAndCount.mockResolvedValue([[], 25]);

    const result = await service.listQuestionnaires({ page: 2, limit: 10 });

    expect(questionnaireRepository.findAndCount).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 10, take: 10 }),
    );
    expect(result).toEqual({ items: [], total: 25, limit: 10, offset: 10 });
  });

  it('defaults to limit 10 and offset 0 without pagination input', async () => {
    questionnaireRepository.findAndCount.mockResolvedValue([[], 3]);

    const result = await service.listQuestionnaires({});

    expect(questionnaireRepository.findAndCount).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 0, take: 10 }),
    );
    expect(result).toEqual({ items: [], total: 3, limit: 10, offset: 0 });
  });

  it('rejects an offset that disagrees with page', async () => {
    await expect(
      service.listQuestionnaires({
        page: 2,
        limit: 10,
        offset: 40,
      }),
    ).rejects.toThrow(BadRequestException);
  });

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

    await expect(
      service.createOption(10, { label: 'Nope' }),
    ).rejects.toThrow(BadRequestException);
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
    expect(detail.questions[1].options.map((item: AnswerOption) => item.id)).toEqual([
      101, 102, 103,
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
    await expect(
      service.updateQuestion(99, { question: 'x' }),
    ).rejects.toThrow(NotFoundException);
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
