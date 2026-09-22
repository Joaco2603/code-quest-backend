import { Test, TestingModule } from '@nestjs/testing';
import { PassportModule } from '@nestjs/passport';
import { vi } from 'vitest';
import { AssessmentsController } from '../controllers/assessments.controller.js';
import { AssessmentsService } from '../assessments.service.js';
import { ValidRoles } from '../../../auth/interfaces/index.js';
import type { AuthUser } from '../../../auth/interfaces/auth-user.type.js';

describe('AssessmentsController', () => {
  let controller: AssessmentsController;

  const student: AuthUser = {
    id: 'user-uuid-1',
    email: 'student@example.com',
    is_two_factor_enabled: false,
    is_two_factor_validated: true,
    role: ValidRoles.user,
  };

  const assessmentsService = {
    start: vi.fn(),
    listMine: vi.fn(),
    findMine: vi.fn(),
    upsertAnswer: vi.fn(),
    complete: vi.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [PassportModule.register({ defaultStrategy: 'jwt' })],
      controllers: [AssessmentsController],
      providers: [
        { provide: AssessmentsService, useValue: assessmentsService },
      ],
    }).compile();

    controller = module.get(AssessmentsController);
    vi.clearAllMocks();
  });

  it('starts an assessment for the current user', async () => {
    assessmentsService.start.mockResolvedValue({ id: 1 });

    await controller.start(student, { questionnaireId: 4 });

    expect(assessmentsService.start).toHaveBeenCalledWith(student, {
      questionnaireId: 4,
    });
  });

  it('lists current user assessments', async () => {
    assessmentsService.listMine.mockResolvedValue([]);

    await controller.listMine(student);

    expect(assessmentsService.listMine).toHaveBeenCalledWith(student);
  });

  it('loads one owned assessment', async () => {
    assessmentsService.findMine.mockResolvedValue({ id: 1 });

    await controller.findMine(student, 1);

    expect(assessmentsService.findMine).toHaveBeenCalledWith(student, 1);
  });

  it('upserts an answer', async () => {
    assessmentsService.upsertAnswer.mockResolvedValue({ id: 1 });

    await controller.upsertAnswer(student, 1, {
      questionId: 10,
      answerOptionId: 101,
    });

    expect(assessmentsService.upsertAnswer).toHaveBeenCalledWith(student, 1, {
      questionId: 10,
      answerOptionId: 101,
    });
  });

  it('completes an assessment', async () => {
    assessmentsService.complete.mockResolvedValue({
      id: 1,
      completedAt: new Date(),
    });

    await controller.complete(student, 1);

    expect(assessmentsService.complete).toHaveBeenCalledWith(student, 1);
  });
});
