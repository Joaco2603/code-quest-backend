import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { CatalogService } from '../catalog/catalog.service.js';
import { CreateRoadmapDto, UpdateRoadmapDto } from './dtos/index.js';
import { RoadmapCourse } from './entities/roadmap-course.entity.js';
import { Roadmap } from './entities/roadmap.entity.js';

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

  async create(userId: string, dto: CreateRoadmapDto) {
    this.assertUniqueCourseIds(dto.courseIds);
    return this.withCatalogLock(async (manager) => {
      await this.catalog.validateRoadmapSelection(dto.courseIds, []);
      const roadmap = manager.create(Roadmap, {
        title: dto.title,
        userId,
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

  async findAll(userId: string) {
    const roadmaps = await this.roadmaps.find({
      where: { userId },
      relations: { courses: true },
      order: { id: 'ASC' },
    });
    return Promise.all(
      roadmaps.map((roadmap) => this.present(roadmap, this.sorted(roadmap))),
    );
  }

  async findOne(userId: string, id: number) {
    const roadmap = await this.requireOwned(userId, id);
    return this.present(roadmap, this.sorted(roadmap));
  }

  async update(userId: string, id: number, dto: UpdateRoadmapDto) {
    await this.requireOwned(userId, id);

    if (dto.courseIds) {
      this.assertUniqueCourseIds(dto.courseIds);
      return this.withCatalogLock(async (manager) => {
        const roadmap = await this.requireOwned(userId, id, manager);
        const previous = this.sorted(roadmap);
        const remaining = new Map(
          previous
            .filter((item) => dto.courseIds!.includes(item.courseId))
            .map((item) => [item.courseId, item]),
        );
        const completedIds = [...remaining.values()]
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

    const roadmap = await this.requireOwned(userId, id);
    if (dto.title !== undefined) {
      roadmap.title = dto.title;
      await this.roadmaps.save(roadmap);
    }
    return this.present(roadmap, this.sorted(roadmap));
  }

  async updateProgress(
    userId: string,
    roadmapId: number,
    courseId: number,
    progress: number,
  ) {
    this.assertProgress(progress);
    const roadmap = await this.requireOwned(userId, roadmapId);
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

  async remove(userId: string, id: number) {
    const roadmap = await this.requireOwned(userId, id);
    await this.roadmaps.remove(roadmap);
  }

  private assertUniqueCourseIds(ids: number[]) {
    if (new Set(ids).size !== ids.length) {
      throw new BadRequestException('Provide unique positive course IDs');
    }
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
      await manager.query(`SELECT pg_advisory_xact_lock(${CATALOG_WRITE_LOCK})`);
      return work(manager);
    });
  }

  private async requireOwned(
    userId: string,
    id: number,
    manager?: EntityManager,
  ) {
    const repo = manager ? manager.getRepository(Roadmap) : this.roadmaps;
    const roadmap = await repo.findOne({
      where: { id, userId },
      relations: { courses: true },
    });
    if (!roadmap) {
      throw new NotFoundException('Roadmap not found');
    }
    return roadmap;
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
    const catalogCourses = await this.catalog.getCoursesForExistingRoadmap(
      memberships.map((item) => item.courseId),
    );
    return {
      id: roadmap.id,
      title: roadmap.title,
      userId: roadmap.userId,
      courses: memberships.map((item, index) => ({
        courseId: item.courseId,
        progress: item.progress,
        sortOrder: item.sortOrder,
        course: catalogCourses[index],
      })),
    };
  }
}
