import { RoadmapGenerationService } from '../roadmap-generation.service.js';
import { Test, TestingModule } from '@nestjs/testing';
import { PassportModule } from '@nestjs/passport';
import { vi, type Mocked } from 'vitest';
import { ValidRoles } from '../../auth/interfaces/index.js';
import type { AuthUser } from '../../auth/interfaces/auth-user.type.js';
import { RoadmapsController } from '../roadmaps.controller.js';
import { RoadmapsService } from '../roadmaps.service.js';

describe('RoadmapsController', () => {
  let controller: RoadmapsController;
  let service: Mocked<
    Pick<
      RoadmapsService,
      'create' | 'findAll' | 'findOne' | 'update' | 'updateProgress' | 'remove'
    >
  >;

  const user: AuthUser = {
    id: '11111111-1111-4111-8111-111111111111',
    email: 'student@example.com',
    is_two_factor_enabled: false,
    is_two_factor_validated: true,
    role: ValidRoles.user,
  };

  beforeEach(async () => {
    service = {
      create: vi.fn(),
      findAll: vi.fn(),
      findOne: vi.fn(),
      update: vi.fn(),
      updateProgress: vi.fn(),
      remove: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      imports: [PassportModule.register({ defaultStrategy: 'jwt' })],
      controllers: [RoadmapsController],
      providers: [
        { provide: RoadmapsService, useValue: service },
        { provide: RoadmapGenerationService, useValue: { generate: vi.fn() } },
      ],
    }).compile();

    controller = module.get(RoadmapsController);
  });

  it('creates a roadmap for the authenticated user', async () => {
    const dto = { title: 'Path', courseIds: [1] };
    service.create.mockResolvedValue({ id: 1 } as never);

    await controller.create(user, dto);

    expect(service.create).toHaveBeenCalledWith(user.id, dto);
  });

  it('loads one roadmap scoped to the current user', async () => {
    service.findOne.mockResolvedValue({ id: 4 } as never);

    await controller.findOne(user, 4);

    expect(service.findOne).toHaveBeenCalledWith(user.id, 4);
  });

  it('updates progress through the service', async () => {
    service.updateProgress.mockResolvedValue({ id: 4 } as never);

    await controller.updateProgress(user, 4, 9, { progress: 25 });

    expect(service.updateProgress).toHaveBeenCalledWith(user.id, 4, 9, 25);
  });
});
