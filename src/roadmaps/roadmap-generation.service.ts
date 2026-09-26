import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  DataSource,
  QueryFailedError,
  type EntityManager,
  Repository,
} from 'typeorm';
import type { AuthUser } from '../auth/interfaces/auth-user.type.js';
import { CatalogService } from '../catalog/catalog.service.js';
import { Assessment } from '../questions/assessments/entities/assessment.entity.js';
import { UserAnswer } from '../questions/assessments/entities/user-answer.entity.js';
import { QuestionsService } from '../questions/questionnaires/questions.service.js';
import { RoadmapCourse } from './entities/roadmap-course.entity.js';
import { RoadmapScope } from './entities/roadmap-scope.enum.js';
import { Roadmap } from './entities/roadmap.entity.js';
import { OpenAiRoadmapClient } from './openai-roadmap.client.js';
import {
  planPersonalRoadmap,
  UnusableRoadmapPlan,
  type RoadmapPlan,
} from './plan-personal-roadmap.js';
import { readPersonalProfile } from './personal-profile.js';
import { selectPersonalCandidates } from './select-personal-candidates.js';
import { RoadmapsService } from './roadmaps.service.js';

const CATALOG_WRITE_LOCK = 1789600000;

@Injectable()
export class RoadmapGenerationService {
  constructor(
    @InjectRepository(Roadmap)
    private readonly roadmaps: Repository<Roadmap>,
    @InjectRepository(Assessment)
    private readonly assessments: Repository<Assessment>,
    @InjectRepository(UserAnswer)
    private readonly answers: Repository<UserAnswer>,
    private readonly questions: QuestionsService,
    private readonly catalog: CatalogService,
    private readonly roadmapsService: RoadmapsService,
    private readonly dataSource: DataSource,
    private readonly llm: OpenAiRoadmapClient,
  ) {}

  async generate(user: AuthUser, assessmentId: number) {
    const ready = await this.existingForOwner(user, assessmentId);
    if (ready) return this.roadmapsService.findOne(user, ready.id);

    const assessment = await this.assessments.findOne({
      where: { id: assessmentId, userId: user.id },
    });
    if (!assessment) throw new NotFoundException('Assessment not found');
    if (!assessment.completedAt)
      throw new ConflictException(
        'Complete the assessment before generating a roadmap',
      );

    const questionnaire = await this.questions.getQuestionnaireForAdmin(
      assessment.questionnaireId,
    );
    const stored = await this.answers.find({ where: { assessmentId } });
    const profile = readPersonalProfile(questionnaire.questions, stored);
    if (!profile)
      throw new BadRequestException(
        'A personal goal and area are required to generate a roadmap',
      );

    const catalog = await this.catalog.getPublishedCatalog();
    const candidates = selectPersonalCandidates(catalog, profile);
    if (!candidates.length)
      throw new ConflictException('No published courses match this profile');

    let plan: RoadmapPlan;
    try {
      plan = await planPersonalRoadmap(
        profile,
        candidates,
        async (system, prompt) => {
          const completion = await this.llm.complete(system, prompt);
          return completion.content;
        },
      );
    } catch (error) {
      if (error instanceof UnusableRoadmapPlan)
        throw new BadGatewayException(error.message);
      throw error;
    }

    try {
      const savedId = await this.withCatalogLock(async (manager) => {
        const again = await manager.findOne(Roadmap, {
          where: { assessmentId },
        });
        if (again) {
          if (again.userId !== user.id)
            throw new NotFoundException('Roadmap not found');
          return again.id;
        }
        const courses = await this.validatedSelection(plan.courseIds);
        const roadmap = await manager.save(
          manager.create(Roadmap, {
            title: plan.title,
            rationale: plan.rationale,
            userId: user.id,
            scope: RoadmapScope.Personal,
            assessmentId,
          }),
        );
        await manager.save(
          courses.map((course, sortOrder) =>
            manager.create(RoadmapCourse, {
              roadmapId: roadmap.id,
              courseId: course.id,
              sortOrder,
              progress: 0,
            }),
          ),
        );
        return roadmap.id;
      });
      return this.roadmapsService.findOne(user, savedId);
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      const winner = await this.existingForOwner(user, assessmentId);
      if (!winner) throw error;
      return this.roadmapsService.findOne(user, winner.id);
    }
  }

  private async existingForOwner(user: AuthUser, assessmentId: number) {
    const roadmap = await this.roadmaps.findOne({ where: { assessmentId } });
    if (!roadmap) return null;
    if (roadmap.userId !== user.id)
      throw new NotFoundException('Roadmap not found');
    return roadmap;
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
}

function isUniqueViolation(error: unknown) {
  return (
    error instanceof QueryFailedError &&
    (error.driverError as { code?: string } | undefined)?.code === '23505'
  );
}
