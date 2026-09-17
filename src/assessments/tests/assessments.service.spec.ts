import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { IsNull } from 'typeorm';
import { vi } from 'vitest';
import { AssessmentsService } from '../assessments.service.js';
import { ValidRoles } from '../../auth/interfaces/index.js';
import type { AuthUser } from '../../auth/interfaces/auth-user.type.js';
import {
  QuestionType,
  type QuestionnaireSnapshot,
} from '../questions-reader.js';
import type { Assessment } from '../entities/assessment.entity.js';
import type { UserResponse } from '../entities/user-response.entity.js';

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
  overrides?: Partial<QuestionnaireSnapshot>,
): QuestionnaireSnapshot {
  return {
    id: 4,
    title: 'Onboarding',
    isActive: true,
    questions: [
      {
        id: 10,
        questionnaireId: 4,
        question: 'Pick one',
        type: QuestionType.SingleChoice,
        isActive: true,
        sortOrder: 1,
        options: [
          { id: 101, label: 'A', value: 'a', sortOrder: 1 },
          { id: 102, label: 'B', value: 'b', sortOrder: 2 },
        ],
      },
      {
        id: 11,
        questionnaireId: 4,
        question: 'Pick many',
        type: QuestionType.MultipleChoice,
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
        questionnaireId: 4,
        question: 'Explain',
        type: QuestionType.Text,
        isActive: true,
        sortOrder: 3,
        options: [],
      },
      {
        id: 13,
        questionnaireId: 4,
        question: 'How many',
        type: QuestionType.Number,
        isActive: true,
        sortOrder: 4,
        options: [],
      },
      {
        id: 14,
        questionnaireId: 4,
        question: 'Agree',
        type: QuestionType.Boolean,
        isActive: true,
        sortOrder: 5,
        options: [],
      },
      {
        id: 15,
        questionnaireId: 4,
        question: 'Retired',
        type: QuestionType.Text,
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
    responses: undefined as never,
    ...overrides,
  };
}

describe('AssessmentsService', () => {
  const questionsReader = {
    getActiveQuestionnaire: vi.fn(),
  };

  const assessments = {
    findOne: vi.fn(),
    find: vi.fn(),
    create: vi.fn(),
    save: vi.fn(),
  };

  const responses = {
    find: vi.fn(),
    delete: vi.fn(),
    create: vi.fn(),
    save: vi.fn(),
  };

  const service = new AssessmentsService(
    assessments as never,
    responses as never,
    questionsReader as never,
  );

  beforeEach(() => {
    vi.clearAllMocks();
    questionsReader.getActiveQuestionnaire.mockResolvedValue(buildQuestionnaire());
    assessments.create.mockImplementation((data: Partial<Assessment>) => data);
    responses.create.mockImplementation((data: unknown) => data);
    responses.delete.mockResolvedValue({ affected: 1 });
    responses.save.mockImplementation(async (rows: UserResponse[]) =>
      (Array.isArray(rows) ? rows : [rows]).map((row, index) => ({
        id: index + 1,
        assessmentId: row.assessmentId,
        questionId: row.questionId,
        answerOptionId: row.answerOptionId,
        value: row.value,
      })),
    );
    responses.find.mockResolvedValue([]);
  });

  describe('start', () => {
    it('starts an assessment for an active questionnaire', async () => {
      assessments.findOne.mockResolvedValue(null);
      const saved = openAssessment();
      assessments.save.mockResolvedValue(saved);

      const result = await service.start(student, { questionnaireId: 4 });

      expect(questionsReader.getActiveQuestionnaire).toHaveBeenCalledWith(4);
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
      questionsReader.getActiveQuestionnaire.mockRejectedValue(
        new NotFoundException('Questionnaire not found'),
      );

      await expect(service.start(student, { questionnaireId: 9 })).rejects.toThrow(
        NotFoundException,
      );
      expect(assessments.save).not.toHaveBeenCalled();
    });

    it('rejects a second incomplete assessment for the same questionnaire', async () => {
      assessments.findOne.mockResolvedValue(openAssessment());

      await expect(service.start(student, { questionnaireId: 4 })).rejects.toThrow(
        ConflictException,
      );
      expect(assessments.save).not.toHaveBeenCalled();
    });

    it('allows a new assessment after a previous one is completed', async () => {
      assessments.findOne.mockResolvedValue(null);
      assessments.save.mockResolvedValue(openAssessment({ id: 2 }));

      const result = await service.start(student, { questionnaireId: 4 });

      expect(result.id).toBe(2);
    });
  });

  describe('upsertResponse', () => {
    beforeEach(() => {
      assessments.findOne.mockResolvedValue(openAssessment());
      assessments.find.mockResolvedValue([openAssessment()]);
      responses.find.mockResolvedValue([]);
    });

    it('stores a single_choice row from answerOptionId', async () => {
      await service.upsertResponse(student, 1, {
        questionId: 10,
        answerOptionId: 101,
      });

      expect(responses.delete).toHaveBeenCalledWith({
        assessmentId: 1,
        questionId: 10,
      });
      expect(responses.save).toHaveBeenCalledWith([
        {
          assessmentId: 1,
          questionId: 10,
          answerOptionId: 101,
          value: null,
        },
      ]);
    });

    it('stores a single_choice row from a one-element answerOptionIds', async () => {
      await service.upsertResponse(student, 1, {
        questionId: 10,
        answerOptionIds: [102],
      });

      expect(responses.save).toHaveBeenCalledWith([
        expect.objectContaining({ answerOptionId: 102, value: null }),
      ]);
    });

    it('rejects single_choice with the wrong shape', async () => {
      await expect(
        service.upsertResponse(student, 1, {
          questionId: 10,
          answerOptionIds: [101, 102],
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects a single_choice option that does not belong to the question', async () => {
      await expect(
        service.upsertResponse(student, 1, {
          questionId: 10,
          answerOptionId: 201,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('stores one multiple_choice row per selected option', async () => {
      await service.upsertResponse(student, 1, {
        questionId: 11,
        answerOptionIds: [201, 203],
      });

      expect(responses.save).toHaveBeenCalledWith([
        expect.objectContaining({ answerOptionId: 201, value: null }),
        expect.objectContaining({ answerOptionId: 203, value: null }),
      ]);
    });

    it('replaces previous multiple_choice rows on upsert', async () => {
      await service.upsertResponse(student, 1, {
        questionId: 11,
        answerOptionIds: [201, 202],
      });
      await service.upsertResponse(student, 1, {
        questionId: 11,
        answerOptionIds: [203],
      });

      expect(responses.delete).toHaveBeenCalledTimes(2);
      expect(responses.save).toHaveBeenLastCalledWith([
        expect.objectContaining({ answerOptionId: 203 }),
      ]);
    });

    it('rejects empty multiple_choice selections', async () => {
      await expect(
        service.upsertResponse(student, 1, { questionId: 11 }),
      ).rejects.toThrow(BadRequestException);
    });

    it('stores trimmed text', async () => {
      await service.upsertResponse(student, 1, {
        questionId: 12,
        value: '  hello  ',
      });

      expect(responses.save).toHaveBeenCalledWith([
        expect.objectContaining({
          answerOptionId: null,
          value: 'hello',
        }),
      ]);
    });

    it('rejects blank text', async () => {
      await expect(
        service.upsertResponse(student, 1, { questionId: 12, value: '   ' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('stores a canonical number string', async () => {
      await service.upsertResponse(student, 1, {
        questionId: 13,
        value: '12.50',
      });

      expect(responses.save).toHaveBeenCalledWith([
        expect.objectContaining({ value: '12.5' }),
      ]);
    });

    it('rejects a non-numeric value', async () => {
      await expect(
        service.upsertResponse(student, 1, { questionId: 13, value: 'nope' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('stores boolean true/false as canonical strings', async () => {
      await service.upsertResponse(student, 1, {
        questionId: 14,
        value: true,
      });
      await service.upsertResponse(student, 1, {
        questionId: 14,
        value: 'false',
      });

      expect(responses.save).toHaveBeenNthCalledWith(1, [
        expect.objectContaining({ value: 'true' }),
      ]);
      expect(responses.save).toHaveBeenNthCalledWith(2, [
        expect.objectContaining({ value: 'false' }),
      ]);
    });

    it('rejects an invalid boolean value', async () => {
      await expect(
        service.upsertResponse(student, 1, { questionId: 14, value: 'yes' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects answering an inactive question', async () => {
      await expect(
        service.upsertResponse(student, 1, {
          questionId: 15,
          value: 'should fail',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects a question from another questionnaire', async () => {
      await expect(
        service.upsertResponse(student, 1, {
          questionId: 999,
          value: 'nope',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('returns 404 when the assessment is not owned', async () => {
      assessments.findOne.mockResolvedValue(null);

      await expect(
        service.upsertResponse(otherStudent, 1, {
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
        service.upsertResponse(student, 1, {
          questionId: 10,
          answerOptionId: 101,
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('complete', () => {
    const answered: UserResponse[] = [
      {
        id: 1,
        assessmentId: 1,
        questionId: 10,
        answerOptionId: 101,
        value: null,
      } as UserResponse,
      {
        id: 2,
        assessmentId: 1,
        questionId: 11,
        answerOptionId: 201,
        value: null,
      } as UserResponse,
      {
        id: 3,
        assessmentId: 1,
        questionId: 12,
        answerOptionId: null,
        value: 'enough',
      } as UserResponse,
      {
        id: 4,
        assessmentId: 1,
        questionId: 13,
        answerOptionId: null,
        value: '3',
      } as UserResponse,
      {
        id: 5,
        assessmentId: 1,
        questionId: 14,
        answerOptionId: null,
        value: 'true',
      } as UserResponse,
    ];

    it('blocks completion until all active questions are answered', async () => {
      assessments.findOne.mockResolvedValue(openAssessment());
      responses.find.mockResolvedValue(answered.slice(0, 2));

      await expect(service.complete(student, 1)).rejects.toThrow(
        BadRequestException,
      );
      expect(assessments.save).not.toHaveBeenCalled();
    });

    it('sets completedAt when every active question is answered', async () => {
      const assessment = openAssessment();
      assessments.findOne.mockResolvedValue(assessment);
      responses.find.mockResolvedValue(answered);
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
      responses.find.mockResolvedValue(answered);
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
