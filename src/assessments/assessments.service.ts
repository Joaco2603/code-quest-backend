import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, EntityManager, In, QueryFailedError } from 'typeorm';
import { Questionnaire } from '../questions/entities/questionnaire.entity.js';
import { serializeQuestionnaire } from '../questions/serializers/questions.serializer.js';
import { Category, Technology } from '../catalog/entities.js';
import { Assessment, EvaluationConfig, UserResponse } from './entities.js';
import type {
  AssessmentProfile,
  EvaluationDefinition,
  EvaluationSnapshot,
} from './contracts.js';
import type { AssessmentQueryDto, SubmitAssessmentDto } from './dto.js';
import {
  evaluate,
  revisionFor,
  taxonomyReferences,
  validateDefinition,
} from './evaluation.js';

@Injectable()
export class AssessmentsService {
  constructor(private readonly db: DataSource) {}

  private async write<T>(work: (manager: EntityManager) => Promise<T>) {
    try {
      return await this.db.transaction('REPEATABLE READ', async (manager) => {
        await manager.query('SELECT pg_advisory_xact_lock(1789600000)');
        return work(manager);
      });
    } catch (error) {
      if (
        error instanceof QueryFailedError &&
        ['40001', '23503', '23505'].includes(
          (error.driverError as { code: string }).code,
        )
      ) {
        throw new ConflictException(
          'Evaluation or catalog changed concurrently; fetch the form and retry',
        );
      }
      throw error;
    }
  }

  private async questionnaire(manager: EntityManager, id: number) {
    const questionnaire = await manager.findOne(Questionnaire, {
      where: { id, isActive: true },
      relations: { questions: { options: true } },
    });
    if (!questionnaire)
      throw new NotFoundException('Active questionnaire not found');
    return serializeQuestionnaire(questionnaire, true);
  }

  async configure(questionnaireId: number, definition: EvaluationDefinition) {
    return this.write(async (manager) => {
      const questionnaire = await this.questionnaire(manager, questionnaireId);
      validateDefinition(questionnaire, definition);
      await this.validateReferences(manager, definition);
      const previous = await manager.findOneBy(EvaluationConfig, {
        questionnaireId,
      });
      const config = await manager.save(EvaluationConfig, {
        questionnaireId,
        version: (previous?.version ?? 0) + 1,
        definition,
      });
      await manager.query(
        'DELETE FROM evaluation_taxonomy_refs WHERE questionnaire_id = $1',
        [questionnaireId],
      );
      await this.saveReferences(manager, definition, { questionnaireId });
      return { questionnaireId, profileVersion: config.version, definition };
    });
  }

  private async snapshot(
    manager: EntityManager,
    id: number,
  ): Promise<EvaluationSnapshot> {
    const questionnaire = await this.questionnaire(manager, id);
    const config = await manager.findOneBy(EvaluationConfig, {
      questionnaireId: id,
    });
    if (!config)
      throw new ConflictException('Questionnaire evaluation is not configured');
    validateDefinition(questionnaire, config.definition);
    return {
      questionnaire,
      definition: config.definition,
      profileVersion: config.version,
      revision: revisionFor(questionnaire, config.definition, config.version),
    };
  }

  async getForm(questionnaireId: number) {
    return this.db.transaction('REPEATABLE READ', (manager) =>
      this.snapshot(manager, questionnaireId),
    );
  }

  async submit(userId: string, dto: SubmitAssessmentDto) {
    return this.write(async (manager) => {
      const snapshot = await this.snapshot(manager, dto.questionnaireId);
      if (dto.revision !== snapshot.revision)
        throw new ConflictException(
          'Questionnaire changed; fetch the evaluation form again',
        );
      const result = evaluate(
        snapshot.questionnaire,
        snapshot.definition,
        dto.answers,
      );
      const assessment = await manager.save(Assessment, {
        userId,
        questionnaireId: dto.questionnaireId,
        completedAt: new Date(),
        snapshot,
        profile: result.profile,
      });
      await manager.save(
        UserResponse,
        result.answers.map((answer) => ({
          ...answer,
          assessmentId: assessment.id,
        })),
      );
      await this.saveReferences(manager, snapshot.definition, {
        assessmentId: assessment.id,
      });
      return this.serialize(assessment, result.answers);
    });
  }

  async list(userId: string, query: AssessmentQueryDto) {
    const [items, total] = await this.db
      .getRepository(Assessment)
      .findAndCount({
        where: { userId },
        order: { id: 'DESC' },
        take: query.limit,
        skip: query.offset,
      });
    return {
      items: items.map((a) => this.profile(a)),
      total,
      limit: query.limit,
      offset: query.offset,
    };
  }

  private async owned(userId: string, id: number, responses = false) {
    const assessment = await this.db
      .getRepository(Assessment)
      .findOne({ where: { id, userId }, relations: { responses } });
    if (!assessment) throw new NotFoundException('Assessment not found');
    return assessment;
  }

  async get(userId: string, id: number) {
    const assessment = await this.owned(userId, id, true);
    const order = new Map(
      assessment.snapshot.questionnaire.questions.map((q, i) => [q.id, i]),
    );
    return this.serialize(
      assessment,
      assessment.responses.sort(
        (a, b) => order.get(a.questionId)! - order.get(b.questionId)!,
      ),
    );
  }

  async getProfileForUser(
    userId: string,
    assessmentId: number,
  ): Promise<AssessmentProfile> {
    const assessment = await this.owned(userId, assessmentId);
    if (!assessment.profile.readyForGeneration)
      throw new ConflictException(
        'An interest and a goal are required to generate a roadmap',
      );
    return this.profile(assessment);
  }

  private profile(assessment: Assessment): AssessmentProfile {
    return {
      assessmentId: assessment.id,
      questionnaireId: assessment.questionnaireId,
      profileVersion: assessment.snapshot.profileVersion,
      completedAt: assessment.completedAt.toISOString(),
      ...assessment.profile,
    };
  }

  private serialize(
    assessment: Assessment,
    answers: Array<{ questionId: number; value: unknown }>,
  ) {
    return {
      profile: this.profile(assessment),
      snapshot: assessment.snapshot,
      answers: answers.map((a) => ({
        questionId: a.questionId,
        value: a.value,
      })),
    };
  }

  private async validateReferences(
    manager: EntityManager,
    definition: EvaluationDefinition,
  ) {
    const refs = taxonomyReferences(definition);
    const categories = refs.categoryIds.length
      ? await manager.countBy(Category, { id: In(refs.categoryIds) })
      : 0;
    const technologies = refs.technologyIds.length
      ? await manager.countBy(Technology, { id: In(refs.technologyIds) })
      : 0;
    if (
      categories !== refs.categoryIds.length ||
      technologies !== refs.technologyIds.length
    )
      throw new ConflictException('Unknown catalog references');
  }

  private async saveReferences(
    manager: EntityManager,
    definition: EvaluationDefinition,
    owner: { questionnaireId?: number; assessmentId?: number },
  ) {
    const refs = taxonomyReferences(definition);
    for (const categoryId of refs.categoryIds) {
      await manager.query(
        'INSERT INTO evaluation_taxonomy_refs(questionnaire_id, assessment_id, category_id) VALUES ($1, $2, $3)',
        [owner.questionnaireId ?? null, owner.assessmentId ?? null, categoryId],
      );
    }
    for (const technologyId of refs.technologyIds) {
      await manager.query(
        'INSERT INTO evaluation_taxonomy_refs(questionnaire_id, assessment_id, technology_id) VALUES ($1, $2, $3)',
        [
          owner.questionnaireId ?? null,
          owner.assessmentId ?? null,
          technologyId,
        ],
      );
    }
  }
}
