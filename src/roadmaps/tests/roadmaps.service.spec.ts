import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { vi, type Mocked } from 'vitest';
import type { AuthUser } from '../../auth/interfaces/auth-user.type.js';
import { ValidRoles } from '../../auth/interfaces/index.js';
import { CatalogService } from '../../catalog/catalog.service.js';
import { RoadmapCourse } from '../entities/roadmap-course.entity.js';
import { RoadmapScope } from '../entities/roadmap-scope.enum.js';
import { Roadmap } from '../entities/roadmap.entity.js';
import { RoadmapsService } from '../roadmaps.service.js';

describe('RoadmapsService', () => {
  let service: RoadmapsService;
  let catalog: Mocked<
    Pick<
      CatalogService,
      'validateRoadmapSelection' | 'getCoursesForExistingRoadmap'
    >
  >;

  const userId = '11111111-1111-4111-8111-111111111111';
  const otherUserId = '22222222-2222-4222-8222-222222222222';

  const actor = (id: string, role = ValidRoles.user): AuthUser => ({
    id,
    email: `${role}@example.com`,
    is_two_factor_enabled: false,
    is_two_factor_validated: true,
    role,
  });

  const roadmapRepo = {
    find: vi.fn(),
    findOne: vi.fn(),
    save: vi.fn(),
    remove: vi.fn(),
  };
  const membershipRepo = {
    save: vi.fn(),
  };

  const manager = {
    query: vi.fn(),
    create: vi.fn((_entity: unknown, data: Record<string, unknown>) => ({
      ...data,
    })),
    save: vi.fn(async (value: unknown) => {
      if (Array.isArray(value)) {
        return value;
      }
      const row = value as Record<string, unknown>;
      return { ...row, id: typeof row.id === 'number' ? row.id : 1 };
    }),
    delete: vi.fn(),
    update: vi.fn(),
    getRepository: vi.fn(),
  };

  const dataSource = {
    transaction: vi.fn(async (work: (m: typeof manager) => Promise<unknown>) =>
      work(manager),
    ),
  };

  const catalogCourse = (id: number) => ({
    id,
    title: `Course ${id}`,
    prerequisiteIds: [],
  });

  beforeEach(async () => {
    vi.clearAllMocks();
    manager.getRepository.mockReturnValue(roadmapRepo);

    catalog = {
      validateRoadmapSelection: vi.fn(async (ids: number[]) =>
        ids.map(catalogCourse),
      ),
      getCoursesForExistingRoadmap: vi.fn(async (ids: number[]) =>
        ids.map(catalogCourse),
      ),
    } as unknown as typeof catalog;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RoadmapsService,
        { provide: CatalogService, useValue: catalog },
        { provide: DataSource, useValue: dataSource },
        { provide: getRepositoryToken(Roadmap), useValue: roadmapRepo },
        {
          provide: getRepositoryToken(RoadmapCourse),
          useValue: membershipRepo,
        },
      ],
    }).compile();

    service = module.get(RoadmapsService);
  });

  it('creates a roadmap with catalog-validated sort_order', async () => {
    const result = await service.create(actor(userId), {
      title: 'Backend',
      courseIds: [10, 20],
    });
    expect(result.scope).toBe(RoadmapScope.Personal);
    expect(catalog.validateRoadmapSelection).toHaveBeenCalledWith([10, 20], []);
    expect(manager.query).toHaveBeenCalledWith(
      'SELECT pg_advisory_xact_lock(1789600000)',
    );
    expect(result.courses.map((item) => item.sortOrder)).toEqual([0, 1]);
    expect(result.courses.map((item) => item.courseId)).toEqual([10, 20]);
    expect(result.courses.every((item) => item.progress === 0)).toBe(true);
  });

  it('stores a global roadmap when an admin creates it', async () => {
    const result = await service.create(actor(userId, ValidRoles.admin), {
      title: 'Catalog path',
      courseIds: [10],
    });

    expect(manager.create).toHaveBeenCalledWith(
      Roadmap,
      expect.objectContaining({
        userId,
        scope: RoadmapScope.Global,
      }),
    );
    expect(result.scope).toBe(RoadmapScope.Global);
  });

  it('lists global roadmaps for an admin', async () => {
    roadmapRepo.find.mockResolvedValue([]);

    await service.findAll(actor(userId, ValidRoles.admin));

    expect(roadmapRepo.find).toHaveBeenCalledWith({
      where: { scope: RoadmapScope.Global },
      relations: { courses: true },
      order: { id: 'ASC' },
    });
  });

  it('rejects non-unique courseIds', async () => {
    await expect(
      service.create(actor(userId), { title: 'Dupes', courseIds: [1, 1] }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(catalog.validateRoadmapSelection).not.toHaveBeenCalled();
  });

  it('lists the current user roadmaps and every global roadmap', async () => {
    roadmapRepo.find.mockResolvedValue([
      {
        id: 1,
        title: 'Mine',
        userId,
        courses: [{ courseId: 3, progress: 0, sortOrder: 0, roadmapId: 1 }],
      },
    ]);

    const result = await service.findAll(actor(userId));

    expect(roadmapRepo.find).toHaveBeenCalledWith({
      where: [
        { userId, scope: RoadmapScope.Personal },
        { scope: RoadmapScope.Global },
      ],
      relations: { courses: true },
      order: { id: 'ASC' },
    });
    expect(result).toHaveLength(1);
    expect(result[0].userId).toBe(userId);
    expect(catalog.getCoursesForExistingRoadmap).toHaveBeenCalledTimes(1);
  });

  it('hydrates every listed roadmap in one catalog read', async () => {
    roadmapRepo.find.mockResolvedValue([
      {
        id: 1,
        title: 'Mine',
        userId,
        courses: [{ courseId: 3, progress: 0, sortOrder: 0, roadmapId: 1 }],
      },
      {
        id: 2,
        title: 'Also mine',
        userId,
        courses: [{ courseId: 4, progress: 0, sortOrder: 0, roadmapId: 2 }],
      },
    ]);

    const result = await service.findAll(actor(userId));

    expect(catalog.getCoursesForExistingRoadmap).toHaveBeenCalledTimes(1);
    expect(catalog.getCoursesForExistingRoadmap).toHaveBeenCalledWith([3, 4]);
    expect(result[0].courses[0].course.id).toBe(3);
    expect(result[1].courses[0].course.id).toBe(4);
  });

  it('lets a student read a global roadmap', async () => {
    roadmapRepo.findOne.mockResolvedValue({
      id: 9,
      title: 'Shared',
      userId: otherUserId,
      scope: RoadmapScope.Global,
      courses: [],
    });

    const result = await service.findOne(actor(userId), 9);

    expect(roadmapRepo.findOne).toHaveBeenCalledWith({
      where: [
        { id: 9, userId, scope: RoadmapScope.Personal },
        { id: 9, scope: RoadmapScope.Global },
      ],
      relations: { courses: true },
    });
    expect(result.scope).toBe(RoadmapScope.Global);
  });

  it('does not let a student mutate a global roadmap', async () => {
    roadmapRepo.findOne.mockResolvedValue(null);

    await expect(
      service.update(actor(userId), 9, { title: 'Nope' }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(roadmapRepo.findOne).toHaveBeenCalledWith({
      where: { id: 9, userId, scope: RoadmapScope.Personal },
      relations: { courses: true },
    });
  });

  it('returns 404 when another user requests a roadmap', async () => {
    roadmapRepo.findOne.mockResolvedValue(null);

    await expect(service.findOne(actor(otherUserId), 1)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('replaces courseIds and preserves progress for kept courses', async () => {
    roadmapRepo.findOne.mockResolvedValue({
      id: 5,
      title: 'Path',
      userId,
      courses: [
        { courseId: 1, progress: 40, sortOrder: 0, roadmapId: 5 },
        { courseId: 2, progress: 10, sortOrder: 1, roadmapId: 5 },
      ],
    });

    const result = await service.update(actor(userId), 5, { courseIds: [2, 8] });

    expect(manager.delete).toHaveBeenCalledWith(RoadmapCourse, {
      roadmapId: 5,
    });
    expect(manager.update).toHaveBeenCalledWith(Roadmap, 5, { title: 'Path' });
    const savedRoadmap = manager.save.mock.calls.find(
      ([value]) => !Array.isArray(value) && (value as { title?: string }).title,
    );
    expect(savedRoadmap).toBeUndefined();
    expect(result.courses).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ courseId: 2, progress: 10, sortOrder: 0 }),
        expect.objectContaining({ courseId: 8, progress: 0, sortOrder: 1 }),
      ]),
    );
  });

  it('passes completedIds from remaining progress===100 courses on update', async () => {
    roadmapRepo.findOne.mockResolvedValue({
      id: 5,
      title: 'Path',
      userId,
      courses: [
        { courseId: 1, progress: 100, sortOrder: 0, roadmapId: 5 },
        { courseId: 2, progress: 50, sortOrder: 1, roadmapId: 5 },
      ],
    });

    await service.update(actor(userId), 5, { courseIds: [1, 3] });

    expect(catalog.validateRoadmapSelection).toHaveBeenCalledWith([1, 3], [1]);
  });

  it('keeps dropped progress===100 courses as completedIds', async () => {
    roadmapRepo.findOne.mockResolvedValue({
      id: 5,
      title: 'Path',
      userId,
      courses: [
        { courseId: 1, progress: 100, sortOrder: 0, roadmapId: 5 },
        { courseId: 2, progress: 0, sortOrder: 1, roadmapId: 5 },
      ],
    });

    await service.update(actor(userId), 5, { courseIds: [2, 3] });

    expect(catalog.validateRoadmapSelection).toHaveBeenCalledWith([2, 3], [1]);
  });

  it('rejects progress outside 0-100', async () => {
    await expect(
      service.updateProgress(actor(userId), 5, 2, 101),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.updateProgress(actor(userId), 5, 2, -1),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(roadmapRepo.findOne).not.toHaveBeenCalled();
  });

  it('updates progress for an owned membership', async () => {
    const existing = {
      id: 5,
      title: 'Path',
      userId,
      courses: [{ courseId: 2, progress: 0, sortOrder: 0, roadmapId: 5 }],
    };
    roadmapRepo.findOne.mockResolvedValue(existing);

    const result = await service.updateProgress(actor(userId), 5, 2, 80);

    expect(membershipRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ courseId: 2, progress: 80 }),
    );
    expect(result.courses[0].progress).toBe(80);
  });

  it('404s progress updates for a course not on the roadmap', async () => {
    roadmapRepo.findOne.mockResolvedValue({
      id: 5,
      title: 'Path',
      userId,
      courses: [{ courseId: 2, progress: 0, sortOrder: 0, roadmapId: 5 }],
    });

    await expect(
      service.updateProgress(actor(userId), 5, 99, 50),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('copies a global roadmap into a personal one at 0 progress', async () => {
    roadmapRepo.findOne
      .mockResolvedValueOnce({
        id: 9,
        title: 'Shared',
        userId: otherUserId,
        scope: RoadmapScope.Global,
        courses: [{ courseId: 3, progress: 80, sortOrder: 0, roadmapId: 9 }],
      })
      .mockResolvedValueOnce(null);

    const result = await service.copyToPersonal(actor(userId), 9);

    expect(catalog.validateRoadmapSelection).toHaveBeenCalledWith([3], []);
    expect(manager.create).toHaveBeenCalledWith(
      Roadmap,
      expect.objectContaining({
        title: 'Shared',
        userId,
        scope: RoadmapScope.Personal,
        sourceRoadmapId: 9,
      }),
    );
    expect(result.scope).toBe(RoadmapScope.Personal);
    expect(result.sourceRoadmapId).toBe(9);
    expect(result.courses).toEqual([
      expect.objectContaining({ courseId: 3, progress: 0, sortOrder: 0 }),
    ]);
  });

  it('returns the existing personal copy instead of creating another', async () => {
    const copy = {
      id: 4,
      title: 'Shared',
      userId,
      scope: RoadmapScope.Personal,
      sourceRoadmapId: 9,
      courses: [{ courseId: 3, progress: 20, sortOrder: 0, roadmapId: 4 }],
    };
    roadmapRepo.findOne
      .mockResolvedValueOnce({
        id: 9,
        title: 'Shared',
        userId: otherUserId,
        scope: RoadmapScope.Global,
        courses: [{ courseId: 3, progress: 80, sortOrder: 0, roadmapId: 9 }],
      })
      .mockResolvedValueOnce(copy);

    const result = await service.copyToPersonal(actor(userId), 9);

    expect(result.id).toBe(4);
    expect(result.courses[0].progress).toBe(20);
    expect(manager.save).not.toHaveBeenCalled();
  });

  it('rejects an admin copying a global roadmap', async () => {
    await expect(
      service.copyToPersonal(actor(userId, ValidRoles.admin), 9),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(roadmapRepo.findOne).not.toHaveBeenCalled();
  });

  it('rejects copying a roadmap that is not global', async () => {
    roadmapRepo.findOne.mockResolvedValue({
      id: 5,
      title: 'Mine',
      userId,
      scope: RoadmapScope.Personal,
      courses: [{ courseId: 3, progress: 0, sortOrder: 0, roadmapId: 5 }],
    });

    await expect(service.copyToPersonal(actor(userId), 5)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(manager.save).not.toHaveBeenCalled();
  });

  it('deletes only when the current user owns the roadmap', async () => {
    roadmapRepo.findOne.mockResolvedValue(null);
    await expect(service.remove(actor(otherUserId), 5)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(roadmapRepo.remove).not.toHaveBeenCalled();

    const owned = { id: 5, title: 'Path', userId, courses: [] };
    roadmapRepo.findOne.mockResolvedValue(owned);
    await service.remove(actor(userId), 5);
    expect(roadmapRepo.remove).toHaveBeenCalledWith(owned);
  });
});
