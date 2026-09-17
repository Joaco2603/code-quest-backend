import { NotFoundException } from '@nestjs/common';
import { vi } from 'vitest';
import { TypeormQuestionsReader } from '../typeorm-questions-reader.js';
import { QuestionType } from '../questions-reader.js';

function mockQueryBuilder(result: unknown) {
  const builder = {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    andWhere: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    getRawOne: vi.fn(),
    getRawMany: vi.fn(),
  };
  if (Array.isArray(result)) {
    builder.getRawMany.mockResolvedValue(result);
  } else {
    builder.getRawOne.mockResolvedValue(result);
  }
  return builder;
}

describe('TypeormQuestionsReader', () => {
  it('loads an active questionnaire with questions and options', async () => {
    const questionnaireBuilder = mockQueryBuilder({
      id: '4',
      title: 'Onboarding',
      isActive: true,
    });
    const questionsBuilder = mockQueryBuilder([
      {
        id: '10',
        questionnaireId: '4',
        question: 'Pick one',
        type: QuestionType.SingleChoice,
        isActive: true,
        sortOrder: '1',
      },
    ]);
    const optionsBuilder = mockQueryBuilder([
      {
        id: '101',
        questionId: '10',
        label: 'A',
        value: 'a',
        sortOrder: '1',
      },
    ]);

    const dataSource = {
      createQueryBuilder: vi
        .fn()
        .mockReturnValueOnce(questionnaireBuilder)
        .mockReturnValueOnce(questionsBuilder)
        .mockReturnValueOnce(optionsBuilder),
    };

    const reader = new TypeormQuestionsReader(dataSource as never);
    const snapshot = await reader.getActiveQuestionnaire(4);

    expect(snapshot).toEqual({
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
          ],
        },
      ],
    });
  });

  it('throws when the questionnaire is missing or inactive', async () => {
    const questionnaireBuilder = mockQueryBuilder(undefined);
    const dataSource = {
      createQueryBuilder: vi.fn().mockReturnValue(questionnaireBuilder),
    };

    const reader = new TypeormQuestionsReader(dataSource as never);

    await expect(reader.getActiveQuestionnaire(99)).rejects.toThrow(
      NotFoundException,
    );
  });
});
