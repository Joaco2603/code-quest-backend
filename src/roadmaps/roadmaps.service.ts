import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, type EntityManager, Repository } from 'typeorm';
import { AssessmentsService } from '../assessments/assessments.service.js';
import { CatalogService } from '../catalog/catalog.service.js';
import type { CourseResponseDto } from '../catalog/dto/catalog-response.dto.js';
import { RoadmapCourse } from './entities/roadmap-course.entity.js';
import { Roadmap } from './entities/roadmap.entity.js';
import { OpenAiRoadmapClient } from './openai-roadmap.client.js';
import {
  planRoadmap,
  UnusableRoadmapPlan,
  type RoadmapPlan,
} from './plan-roadmap.js';
import { selectCandidates } from './select-candidates.js';

const CATALOG_WRITE_LOCK = 1789600000;

export interface RoadmapView {
  id: number;
  title: string;
  rationale: string;
  assessmentId: number;
  createdAt: string;
  courses: Array<{
    courseId: number;
    progress: number;
    sortOrder: number;
    course: CourseResponseDto;
  }>;
}

@Injectable()
export class RoadmapsService {
  constructor(
    @InjectRepository(Roadmap)
    private readonly roadmaps: Repository<Roadmap>,
    private readonly catalog: CatalogService,
    private readonly assessments: AssessmentsService,
    private readonly dataSource: DataSource,
    private readonly llm: OpenAiRoadmapClient,
  ) {}

  async generate(userId: string, assessmentId: number): Promise<RoadmapView> {
    const profile = await this.assessments.getProfileForUser(
      userId,
      assessmentId,
    );
    const catalog = await this.catalog.getPublishedCatalog();
    const candidates = selectCandidates(catalog, profile);
    if (!candidates.length)
      throw new ConflictException('No published courses match this profile');

    let model = '';
    let plan: RoadmapPlan;
    try {
      plan = await planRoadmap(profile, candidates, async (system, user) => {
        const completion = await this.llm.complete(system, user);
        model = completion.model;
        return completion.content;
      });
    } catch (error) {
      if (error instanceof UnusableRoadmapPlan)
        throw new BadGatewayException(error.message);
      throw error;
    }

    return this.withCatalogLock(async (manager) => {
      const courses = await this.validatedSelection(plan.courseIds);
      const roadmap = await manager.save(
        manager.create(Roadmap, {
          title: plan.title,
          rationale: plan.rationale,
          model,
          userId,
          assessmentId: profile.assessmentId,
        }),
      );
      const memberships = await manager.save(
        plan.courseIds.map((courseId, sortOrder) =>
          manager.create(RoadmapCourse, {
            roadmapId: roadmap.id,
            courseId,
            sortOrder,
            progress: 0,
          }),
        ),
      );
      return this.toView(roadmap, memberships, courses);
    });
  }

  async findAll(userId: string): Promise<RoadmapView[]> {
    const roadmaps = await this.roadmaps.find({
      where: { userId },
      relations: { courses: true },
      order: { id: 'DESC' },
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

  async findOne(userId: string, id: number): Promise<RoadmapView> {
    const roadmap = await this.roadmaps.findOne({
      where: { id, userId },
      relations: { courses: true },
    });
    if (!roadmap) throw new NotFoundException('Roadmap not found');
    const memberships = this.sorted(roadmap);
    const courses = memberships.length
      ? await this.catalog.getCoursesForExistingRoadmap(
          memberships.map((item) => item.courseId),
        )
      : [];
    return this.toView(roadmap, memberships, courses);
  }

  private async validatedSelection(ids: number[]) {
    try {
      return await this.catalog.validateRoadmapSelection(ids);
    } catch (error) {
      if (error instanceof BadRequestException)
        throw new ConflictException(
          'The catalog changed while generating the roadmap. Generate it again.',
        );
      throw error;
    }
  }

  private withCatalogLock<T>(work: (manager: EntityManager) => Promise<T>) {
    return this.dataSource.transaction(async (manager) => {
      await manager.query(
        `SELECT pg_advisory_xact_lock(${CATALOG_WRITE_LOCK})`,
      );
      return work(manager);
    });
  }

  private sorted(roadmap: Roadmap) {
    return [...(roadmap.courses ?? [])].sort(
      (left, right) => left.sortOrder - right.sortOrder,
    );
  }

  private toView(
    roadmap: Roadmap,
    memberships: RoadmapCourse[],
    courses: CourseResponseDto[],
  ): RoadmapView {
    return {
      id: roadmap.id,
      title: roadmap.title,
      rationale: roadmap.rationale,
      assessmentId: roadmap.assessmentId,
      createdAt: roadmap.createdAt.toISOString(),
      courses: memberships.map((item, index) => ({
        courseId: item.courseId,
        progress: item.progress,
        sortOrder: item.sortOrder,
        course: courses[index],
      })),
    };
  }
}
