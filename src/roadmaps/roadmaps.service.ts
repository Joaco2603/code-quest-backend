import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import type { AuthUser } from '../auth/interfaces/auth-user.type.js';
import { ValidRoles } from '../auth/interfaces/valid-roles.type.js';
import { CatalogService } from '../catalog/catalog.service.js';
import { CreateRoadmapDto, UpdateRoadmapDto } from './dtos/index.js';
import { RoadmapCourse } from './entities/roadmap-course.entity.js';
import { Roadmap } from './entities/roadmap.entity.js';
import { RoadmapScope } from './entities/roadmap-scope.enum.js';

const CATALOG_WRITE_LOCK = 1789600000;

@Injectable()
export class RoadmapsService {
  constructor(
    @InjectRepository(Roadmap)
    private readonly roadmaps: Repository<Roadmap>,
    @InjectRepository(RoadmapCourse)
    private readonly roadmapCourses: Repository<RoadmapCourse>,
    private readonly catalog: CatalogService,
    private readonly dataSource: DataSource,
  ) {}

  async create(user: AuthUser, dto: CreateRoadmapDto) {
    this.assertUniqueCourseIds(dto.courseIds);
    const scope = this.scopeFor(user);
    return this.withCatalogLock(async (manager) => {
      await this.catalog.validateRoadmapSelection(dto.courseIds, []);
      const roadmap = manager.create(Roadmap, {
        title: dto.title,
        userId: user.id,
        scope,
      });
      const saved = await manager.save(roadmap);
      const memberships = this.buildMemberships(
        manager,
        saved.id,
        dto.courseIds,
        new Map(),
      );
      await manager.save(memberships);
      return this.present(saved, memberships);
    });
  }

  async findAll(user: AuthUser) {
    const roadmaps = await this.roadmaps.find({
      where: this.listWhere(user),
      relations: { courses: true },
      order: { id: 'ASC' },
    });
    const groups = roadmaps.map((roadmap) => ({
      roadmap,
      memberships: this.sorted(roadmap),
    }));
    const courseIds = groups.flatMap((group) =>
      group.memberships.map((item) => item.courseId),
    );
    const hydrated = courseIds.length
      ? await this.catalog.getCoursesForExistingRoadmap(courseIds)
      : [];
    let offset = 0;
    return groups.map((group) => {
      const courses = hydrated.slice(offset, offset + group.memberships.length);
      offset += group.memberships.length;
      return this.toView(group.roadmap, group.memberships, courses);
    });
  }

  async findOne(user: AuthUser, id: number) {
    const roadmap = await this.requireReadable(user, id);
    return this.present(roadmap, this.sorted(roadmap));
  }

  async update(user: AuthUser, id: number, dto: UpdateRoadmapDto) {
    await this.requireWritable(user, id);

    if (dto.courseIds) {
      this.assertUniqueCourseIds(dto.courseIds);
      return this.withCatalogLock(async (manager) => {
        const roadmap = await this.requireWritable(user, id, manager);
        const previous = this.sorted(roadmap);
        const remaining = new Map(
          previous
            .filter((item) => dto.courseIds!.includes(item.courseId))
            .map((item) => [item.courseId, item]),
        );
        const completedIds = previous
          .filter((item) => item.progress === 100)
          .map((item) => item.courseId);

        await this.catalog.validateRoadmapSelection(
          dto.courseIds!,
          completedIds,
        );

        if (dto.title !== undefined) {
          roadmap.title = dto.title;
        }

        await manager.delete(RoadmapCourse, { roadmapId: roadmap.id });
        roadmap.courses = [];
        await manager.update(Roadmap, roadmap.id, { title: roadmap.title });
        const memberships = this.buildMemberships(
          manager,
          roadmap.id,
          dto.courseIds!,
          remaining,
        );
        await manager.save(memberships);
        return this.present(roadmap, memberships);
      });
    }

    const roadmap = await this.requireWritable(user, id);
    if (dto.title !== undefined) {
      roadmap.title = dto.title;
      await this.roadmaps.save(roadmap);
    }
    return this.present(roadmap, this.sorted(roadmap));
  }

  async updateProgress(
    user: AuthUser,
    roadmapId: number,
    courseId: number,
    progress: number,
  ) {
    this.assertProgress(progress);
    const roadmap = await this.requireWritable(user, roadmapId);
    const membership = this.sorted(roadmap).find(
      (item) => item.courseId === courseId,
    );
    if (!membership) {
      throw new NotFoundException('Roadmap not found');
    }
    membership.progress = progress;
    await this.roadmapCourses.save(membership);
    return this.present(roadmap, this.sorted(roadmap));
  }

  async copyToPersonal(user: AuthUser, sourceId: number) {
    if (user.role === ValidRoles.admin) {
      throw new ForbiddenException(
        'Los roadmaps globales se consultan desde la cuenta de admin',
      );
    }

    const source = await this.requireReadable(user, sourceId);
    if (source.scope !== RoadmapScope.Global) {
      throw new BadRequestException(
        'Solo puedes agregar un roadmap global a tus roadmaps',
      );
    }

    const courseIds = this.sorted(source).map((item) => item.courseId);
    if (courseIds.length === 0) {
      throw new BadRequestException('Este roadmap no tiene cursos');
    }

    const existing = await this.findPersonalCopy(user.id, source.id);
    if (existing) {
      return this.present(existing, this.sorted(existing));
    }

    try {
      return await this.withCatalogLock(async (manager) => {
        await this.catalog.validateRoadmapSelection(courseIds, []);
        const roadmap = manager.create(Roadmap, {
          title: source.title,
          userId: user.id,
          scope: RoadmapScope.Personal,
          sourceRoadmapId: source.id,
        });
        const saved = await manager.save(roadmap);
        const memberships = this.buildMemberships(
          manager,
          saved.id,
          courseIds,
          new Map(),
        );
        await manager.save(memberships);
        return this.present(saved, memberships);
      });
    } catch (error) {
      if (!this.isUniqueViolation(error)) throw error;
      const raced = await this.findPersonalCopy(user.id, source.id);
      if (!raced) throw error;
      return this.present(raced, this.sorted(raced));
    }
  }

  async remove(user: AuthUser, id: number) {
    const roadmap = await this.requireWritable(user, id);
    await this.roadmaps.remove(roadmap);
  }

  private scopeFor(user: AuthUser) {
    return user.role === ValidRoles.admin
      ? RoadmapScope.Global
      : RoadmapScope.Personal;
  }

  private listWhere(user: AuthUser) {
    if (user.role === ValidRoles.admin) {
      return { scope: RoadmapScope.Global };
    }
    return [
      { userId: user.id, scope: RoadmapScope.Personal },
      { scope: RoadmapScope.Global },
    ];
  }

  private assertUniqueCourseIds(ids: number[]) {
    if (new Set(ids).size !== ids.length) {
      throw new BadRequestException('Provide unique positive course IDs');
    }
  }

  private findPersonalCopy(userId: string, sourceRoadmapId: number) {
    return this.roadmaps.findOne({
      where: {
        userId,
        scope: RoadmapScope.Personal,
        sourceRoadmapId,
      },
      relations: { courses: true },
    });
  }

  private isUniqueViolation(error: unknown) {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: string }).code === '23505'
    );
  }

  private assertProgress(progress: number) {
    if (!Number.isInteger(progress) || progress < 0 || progress > 100) {
      throw new BadRequestException(
        'Progress must be an integer between 0 and 100',
      );
    }
  }

  private async withCatalogLock<T>(
    work: (manager: EntityManager) => Promise<T>,
  ): Promise<T> {
    return this.dataSource.transaction(async (manager) => {
      await manager.query(
        `SELECT pg_advisory_xact_lock(${CATALOG_WRITE_LOCK})`,
      );
      return work(manager);
    });
  }

  private async requireReadable(user: AuthUser, id: number) {
    return this.findScoped(user, id, true);
  }

  private async requireWritable(
    user: AuthUser,
    id: number,
    manager?: EntityManager,
  ) {
    return this.findScoped(user, id, false, manager);
  }

  private async findScoped(
    user: AuthUser,
    id: number,
    includeGlobalForStudent: boolean,
    manager?: EntityManager,
  ) {
    const repo = manager ? manager.getRepository(Roadmap) : this.roadmaps;
    const roadmap = await repo.findOne({
      where: this.accessWhere(user, id, includeGlobalForStudent),
      relations: { courses: true },
    });
    if (!roadmap) {
      throw new NotFoundException('Roadmap not found');
    }
    return roadmap;
  }

  private accessWhere(
    user: AuthUser,
    id: number,
    includeGlobalForStudent: boolean,
  ) {
    if (user.role === ValidRoles.admin) {
      return { id, scope: RoadmapScope.Global };
    }
    if (!includeGlobalForStudent) {
      return { id, userId: user.id, scope: RoadmapScope.Personal };
    }
    return [
      { id, userId: user.id, scope: RoadmapScope.Personal },
      { id, scope: RoadmapScope.Global },
    ];
  }

  private buildMemberships(
    manager: EntityManager,
    roadmapId: number,
    courseIds: number[],
    previous: Map<number, RoadmapCourse>,
  ) {
    return courseIds.map((courseId, sortOrder) =>
      manager.create(RoadmapCourse, {
        roadmapId,
        courseId,
        sortOrder,
        progress: previous.get(courseId)?.progress ?? 0,
      }),
    );
  }

  private sorted(roadmap: Roadmap) {
    return [...(roadmap.courses ?? [])].sort(
      (a, b) => a.sortOrder - b.sortOrder,
    );
  }

  private async present(roadmap: Roadmap, memberships: RoadmapCourse[]) {
    const catalogCourses = memberships.length
      ? await this.catalog.getCoursesForExistingRoadmap(
          memberships.map((item) => item.courseId),
        )
      : [];
    return this.toView(roadmap, memberships, catalogCourses);
  }

  private toView(
    roadmap: Roadmap,
    memberships: RoadmapCourse[],
    catalogCourses: Awaited<
      ReturnType<CatalogService['getCoursesForExistingRoadmap']>
    >,
  ) {
    return {
      id: roadmap.id,
      title: roadmap.title,
      rationale: roadmap.rationale ?? null,
      assessmentId: roadmap.assessmentId ?? null,
      userId: roadmap.userId,
      scope: roadmap.scope,
      sourceRoadmapId: roadmap.sourceRoadmapId ?? null,
      courses: memberships.map((item, index) => ({
        courseId: item.courseId,
        progress: item.progress,
        sortOrder: item.sortOrder,
        course: catalogCourses[index],
      })),
    };
  }
}
