import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { IsNull } from 'typeorm';
import { vi } from 'vitest';
import { AssessmentsService } from '../assessments.service.js';
import { ValidRoles } from '../../../auth/interfaces/index.js';
import type { AuthUser } from '../../../auth/interfaces/auth-user.type.js';
import { QuestionType } from '../../questionnaires/enums/question-type.enum.js';
import type { QuestionnaireDetail } from '../../questionnaires/interfaces/index.js';
import type { Assessment } from '../entities/assessment.entity.js';
import type { UserAnswer } from '../entities/user-answer.entity.js';

const student: AuthUser = {
  id: 'user-uuid-1',
  email: 'student@example.com',
  is_two_factor_enabled: false,
  is_two_factor_validated: true,
  role: ValidRoles.user,
};

const otherStudent: AuthUser = {
  ...student,
  id: 'user-uuid-2',
  email: 'other@example.com',
};

function buildQuestionnaire(
  overrides?: Partial<QuestionnaireDetail>,
): QuestionnaireDetail {
  return {
    id: 4,
    title: 'Onboarding',
    description: null,
    isActive: true,
    createdAt: new Date('2026-09-17T08:00:00.000Z'),
    questions: [
      {
        id: 10,
        question: 'Pick one',
        type: QuestionType.SINGLE_CHOICE,
        isActive: true,
        sortOrder: 1,
        options: [
          { id: 101, label: 'A', value: 'a', sortOrder: 1 },
          { id: 102, label: 'B', value: 'b', sortOrder: 2 },
        ],
      },
      {
        id: 11,
        question: 'Pick many',
        type: QuestionType.MULTIPLE_CHOICE,
        isActive: true,
        sortOrder: 2,
        options: [
          { id: 201, label: 'X', value: 'x', sortOrder: 1 },
          { id: 202, label: 'Y', value: 'y', sortOrder: 2 },
          { id: 203, label: 'Z', value: 'z', sortOrder: 3 },
        ],
      },
      {
        id: 12,
        question: 'Explain',
        type: QuestionType.TEXT,
        isActive: true,
        sortOrder: 3,
        options: [],
      },
      {
        id: 13,
        question: 'How many',
        type: QuestionType.NUMBER,
        isActive: true,
        sortOrder: 4,
        options: [],
      },
      {
        id: 14,
        question: 'Agree',
        type: QuestionType.BOOLEAN,
        isActive: true,
        sortOrder: 5,
        options: [],
      },
      {
        id: 15,
        question: 'Retired',
        type: QuestionType.TEXT,
        isActive: false,
        sortOrder: 6,
        options: [],
      },
    ],
    ...overrides,
  };
}

function openAssessment(overrides?: Partial<Assessment>): Assessment {
  return {
    id: 1,
    userId: student.id,
    questionnaireId: 4,
    createdAt: new Date('2026-09-17T08:00:00.000Z'),
    completedAt: null,
    user: undefined as never,
    answers: undefined as never,
    ...overrides,
  };
}

describe('AssessmentsService', () => {
  const questionsService = {
    getActiveQuestionnaire: vi.fn(),
  };

  const assessments = {
    manager: { transaction: vi.fn() },
    findOne: vi.fn(),
    find: vi.fn(),
    create: vi.fn(),
    save: vi.fn(),
  };

  const answers = {
    find: vi.fn(),
    delete: vi.fn(),
    create: vi.fn(),
    save: vi.fn(),
  };

  const service = new AssessmentsService(
    assessments as never,
    answers as never,
    questionsService as never,
  );

  beforeEach(() => {
    vi.clearAllMocks();
    assessments.manager.transaction.mockImplementation(async (work) =>
      work({
        getRepository: (entity: { name: string }) =>
          entity.name === 'Assessment' ? assessments : answers,
      }),
    );
    questionsService.getActiveQuestionnaire.mockResolvedValue(
      buildQuestionnaire(),
    );
    assessments.create.mockImplementation((data: Partial<Assessment>) => data);
    answers.create.mockImplementation((data: unknown) => data);
    answers.delete.mockResolvedValue({ affected: 1 });
    answers.save.mockImplementation(async (rows: UserAnswer[]) =>
      (Array.isArray(rows) ? rows : [rows]).map((row, index) => ({
        id: index + 1,
        assessmentId: row.assessmentId,
        questionId: row.questionId,
        answerOptionId: row.answerOptionId,
        value: row.value,
      })),
    );
    answers.find.mockResolvedValue([]);
  });

  describe('start', () => {
    it('starts an assessment for an active questionnaire', async () => {
      assessments.findOne.mockResolvedValue(null);
      const saved = openAssessment();
      assessments.save.mockResolvedValue(saved);

      const result = await service.start(student, { questionnaireId: 4 });

      expect(questionsService.getActiveQuestionnaire).toHaveBeenCalledWith(4);
      expect(assessments.findOne).toHaveBeenCalledWith({
        where: {
          userId: student.id,
          questionnaireId: 4,
          completedAt: IsNull(),
        },
      });
      expect(result).toMatchObject({
        id: 1,
        userId: student.id,
        questionnaireId: 4,
        completedAt: null,
      });
    });

    it('rejects an inactive questionnaire', async () => {
      questionsService.getActiveQuestionnaire.mockRejectedValue(
        new NotFoundException('Questionnaire not found'),
      );

      await expect(
        service.start(student, { questionnaireId: 9 }),
      ).rejects.toThrow(NotFoundException);
      expect(assessments.save).not.toHaveBeenCalled();
    });

    it('rejects a second incomplete assessment for the same questionnaire', async () => {
      assessments.findOne.mockResolvedValue(openAssessment());

      await expect(
        service.start(student, { questionnaireId: 4 }),
      ).rejects.toThrow(ConflictException);
      expect(assessments.save).not.toHaveBeenCalled();
    });

    it('allows a new assessment after a previous one is completed', async () => {
      assessments.findOne.mockResolvedValue(null);
      assessments.save.mockResolvedValue(openAssessment({ id: 2 }));

      const result = await service.start(student, { questionnaireId: 4 });

      expect(result.id).toBe(2);
    });
  });

  describe('upsertAnswer', () => {
    beforeEach(() => {
      assessments.findOne.mockResolvedValue(openAssessment());
      assessments.find.mockResolvedValue([openAssessment()]);
      answers.find.mockResolvedValue([]);
    });

    it('stores a single_choice row from answerOptionId', async () => {
      await service.upsertAnswer(student, 1, {
        questionId: 10,
        answerOptionId: 101,
      });

      expect(answers.delete).toHaveBeenCalledWith({
        assessmentId: 1,
        questionId: 10,
      });
      expect(answers.save).toHaveBeenCalledWith([
        {
          assessmentId: 1,
          questionId: 10,
          answerOptionId: 101,
          value: null,
        },
      ]);
    });

    it('stores a single_choice row from a one-element answerOptionIds', async () => {
      await service.upsertAnswer(student, 1, {
        questionId: 10,
        answerOptionIds: [102],
      });

      expect(answers.save).toHaveBeenCalledWith([
        expect.objectContaining({ answerOptionId: 102, value: null }),
      ]);
    });

    it('rejects single_choice with the wrong shape', async () => {
      await expect(
        service.upsertAnswer(student, 1, {
          questionId: 10,
          answerOptionIds: [101, 102],
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects a single_choice option that does not belong to the question', async () => {
      await expect(
        service.upsertAnswer(student, 1, {
          questionId: 10,
          answerOptionId: 201,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('stores one multiple_choice row per selected option', async () => {
      await service.upsertAnswer(student, 1, {
        questionId: 11,
        answerOptionIds: [201, 203],
      });

      expect(answers.save).toHaveBeenCalledWith([
        expect.objectContaining({ answerOptionId: 201, value: null }),
        expect.objectContaining({ answerOptionId: 203, value: null }),
      ]);
    });

    it('replaces previous multiple_choice rows on upsert', async () => {
      await service.upsertAnswer(student, 1, {
        questionId: 11,
        answerOptionIds: [201, 202],
      });
      await service.upsertAnswer(student, 1, {
        questionId: 11,
        answerOptionIds: [203],
      });

      expect(answers.delete).toHaveBeenCalledTimes(2);
      expect(answers.save).toHaveBeenLastCalledWith([
        expect.objectContaining({ answerOptionId: 203 }),
      ]);
    });

    it('rejects empty multiple_choice selections', async () => {
      await expect(
        service.upsertAnswer(student, 1, { questionId: 11 }),
      ).rejects.toThrow(BadRequestException);
    });

    it('stores trimmed text', async () => {
      await service.upsertAnswer(student, 1, {
        questionId: 12,
        value: '  hello  ',
      });

      expect(answers.save).toHaveBeenCalledWith([
        expect.objectContaining({
          answerOptionId: null,
          value: 'hello',
        }),
      ]);
    });

    it('rejects blank text', async () => {
      await expect(
        service.upsertAnswer(student, 1, { questionId: 12, value: '   ' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('stores a canonical number string', async () => {
      await service.upsertAnswer(student, 1, {
        questionId: 13,
        value: '12.50',
      });

      expect(answers.save).toHaveBeenCalledWith([
        expect.objectContaining({ value: '12.5' }),
      ]);
    });

    it('rejects a non-numeric value', async () => {
      await expect(
        service.upsertAnswer(student, 1, { questionId: 13, value: 'nope' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('stores boolean true/false as canonical strings', async () => {
      await service.upsertAnswer(student, 1, {
        questionId: 14,
        value: true,
      });
      await service.upsertAnswer(student, 1, {
        questionId: 14,
        value: 'false',
      });

      expect(answers.save).toHaveBeenNthCalledWith(1, [
        expect.objectContaining({ value: 'true' }),
      ]);
      expect(answers.save).toHaveBeenNthCalledWith(2, [
        expect.objectContaining({ value: 'false' }),
      ]);
    });

    it('rejects an invalid boolean value', async () => {
      await expect(
        service.upsertAnswer(student, 1, { questionId: 14, value: 'yes' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects answering an inactive question', async () => {
      await expect(
        service.upsertAnswer(student, 1, {
          questionId: 15,
          value: 'should fail',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects a question from another questionnaire', async () => {
      await expect(
        service.upsertAnswer(student, 1, {
          questionId: 999,
          value: 'nope',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('returns 404 when the assessment is not owned', async () => {
      assessments.findOne.mockResolvedValue(null);

      await expect(
        service.upsertAnswer(otherStudent, 1, {
          questionId: 10,
          answerOptionId: 101,
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('rejects writes after the assessment is completed', async () => {
      assessments.findOne.mockResolvedValue(
        openAssessment({ completedAt: new Date() }),
      );

      await expect(
        service.upsertAnswer(student, 1, {
          questionId: 10,
          answerOptionId: 101,
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('complete', () => {
    const answered: UserAnswer[] = [
      {
        id: 1,
        assessmentId: 1,
        questionId: 10,
        answerOptionId: 101,
        value: null,
      } as UserAnswer,
      {
        id: 2,
        assessmentId: 1,
        questionId: 11,
        answerOptionId: 201,
        value: null,
      } as UserAnswer,
      {
        id: 3,
        assessmentId: 1,
        questionId: 12,
        answerOptionId: null,
        value: 'enough',
      } as UserAnswer,
      {
        id: 4,
        assessmentId: 1,
        questionId: 13,
        answerOptionId: null,
        value: '3',
      } as UserAnswer,
      {
        id: 5,
        assessmentId: 1,
        questionId: 14,
        answerOptionId: null,
        value: 'true',
      } as UserAnswer,
    ];

    it('blocks completion until all active questions are answered', async () => {
      assessments.findOne.mockResolvedValue(openAssessment());
      answers.find.mockResolvedValue(answered.slice(0, 2));

      await expect(service.complete(student, 1)).rejects.toThrow(
        BadRequestException,
      );
      expect(assessments.save).not.toHaveBeenCalled();
    });

    it('sets completedAt when every active question is answered', async () => {
      const assessment = openAssessment();
      assessments.findOne.mockResolvedValue(assessment);
      answers.find.mockResolvedValue(answered);
      assessments.save.mockImplementation(async (row: Assessment) => row);

      const result = await service.complete(student, 1);

      expect(result.completedAt).toBeInstanceOf(Date);
      expect(assessments.save).toHaveBeenCalledWith(
        expect.objectContaining({ completedAt: expect.any(Date) }),
      );
    });

    it('ignores inactive questions when completing', async () => {
      const assessment = openAssessment();
      assessments.findOne.mockResolvedValue(assessment);
      answers.find.mockResolvedValue(answered);
      assessments.save.mockImplementation(async (row: Assessment) => row);

      await expect(service.complete(student, 1)).resolves.toMatchObject({
        id: 1,
      });
    });

    it('rejects a second complete call', async () => {
      assessments.findOne.mockResolvedValue(
        openAssessment({ completedAt: new Date() }),
      );

      await expect(service.complete(student, 1)).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('findMine / listMine', () => {
    it('lists only the current user assessments', async () => {
      assessments.find.mockResolvedValue([openAssessment()]);

      const result = await service.listMine(student);

      expect(assessments.find).toHaveBeenCalledWith({
        where: { userId: student.id },
        order: { createdAt: 'DESC' },
      });
      expect(result).toHaveLength(1);
    });

    it('returns 404 for another user assessment', async () => {
      assessments.findOne.mockResolvedValue(null);

      await expect(service.findMine(otherStudent, 1)).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
