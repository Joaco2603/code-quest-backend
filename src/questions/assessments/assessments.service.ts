import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { Assessment } from './entities/assessment.entity.js';
import { UserAnswer } from './entities/user-answer.entity.js';
import { CreateAssessmentDto, UpsertAnswerDto } from './dtos/index.js';
import { QuestionsService } from '../questionnaires/questions.service.js';
import { QuestionType } from '../questionnaires/enums/question-type.enum.js';
import type {
  QuestionDetail,
  QuestionnaireDetail,
} from '../questionnaires/interfaces/index.js';
import type { AuthUser } from '../../auth/interfaces/auth-user.type.js';

export type AssessmentAnswerView = {
  id: number;
  questionId: number;
  answerOptionId: number | null;
  value: string | null;
};

export type AssessmentView = {
  id: number;
  userId: string;
  questionnaireId: number;
  createdAt: Date;
  completedAt: Date | null;
  answers?: AssessmentAnswerView[];
};

@Injectable()
export class AssessmentsService {
  constructor(
    @InjectRepository(Assessment)
    private readonly assessments: Repository<Assessment>,
    @InjectRepository(UserAnswer)
    private readonly answers: Repository<UserAnswer>,
    private readonly questionsService: QuestionsService,
  ) {}

  async start(
    user: AuthUser,
    dto: CreateAssessmentDto,
  ): Promise<AssessmentView> {
    const questionnaire = await this.loadActiveQuestionnaire(
      dto.questionnaireId,
    );

    const existing = await this.assessments.findOne({
      where: {
        userId: user.id,
        questionnaireId: questionnaire.id,
        completedAt: IsNull(),
      },
    });

    if (existing) {
      throw new ConflictException(
        'An incomplete assessment already exists for this questionnaire',
      );
    }

    const created = this.assessments.create({
      userId: user.id,
      questionnaireId: questionnaire.id,
      completedAt: null,
    });
    const saved = await this.assessments.save(created);
    return this.toView(saved);
  }

  async listMine(user: AuthUser): Promise<AssessmentView[]> {
    const rows = await this.assessments.find({
      where: { userId: user.id },
      order: { createdAt: 'DESC' },
    });
    return rows.map((row) => this.toView(row));
  }

  async findMine(user: AuthUser, id: number): Promise<AssessmentView> {
    const assessment = await this.getOwned(user, id);
    const answers = await this.answers.find({
      where: { assessmentId: assessment.id },
      order: { id: 'ASC' },
    });
    return this.toView(assessment, answers);
  }

  /** Upsert (update + insert): delete this question's rows, then insert the new ones. */
  async upsertAnswer(
    user: AuthUser,
    id: number,
    dto: UpsertAnswerDto,
  ): Promise<AssessmentView> {
    const assessment = await this.getOwned(user, id);
    this.assertWritable(assessment);

    const questionnaire = await this.loadActiveQuestionnaire(
      assessment.questionnaireId,
    );
    const question = this.findQuestion(questionnaire, dto.questionId);
    const rows = this.buildAnswerRows(assessment.id, question, dto);

    await this.answers.delete({
      assessmentId: assessment.id,
      questionId: question.id,
    });
    const created = this.answers.create(rows);
    await this.answers.save(created);

    return this.findMine(user, id);
  }

  async complete(user: AuthUser, id: number): Promise<AssessmentView> {
    const assessment = await this.getOwned(user, id);
    this.assertWritable(assessment);

    const questionnaire = await this.loadActiveQuestionnaire(
      assessment.questionnaireId,
    );
    const answers = await this.answers.find({
      where: { assessmentId: assessment.id },
    });

    const unanswered = questionnaire.questions.filter(
      (question) =>
        question.isActive && !this.hasValidStoredAnswer(question, answers),
    );

    if (unanswered.length > 0) {
      throw new BadRequestException(
        'All active questions must be answered before completing the assessment',
      );
    }

    assessment.completedAt = new Date();
    const saved = await this.assessments.save(assessment);
    return this.toView(saved, answers);
  }

  private async loadActiveQuestionnaire(
    id: number,
  ): Promise<QuestionnaireDetail> {
    const questionnaire =
      await this.questionsService.getActiveQuestionnaire(id);
    if (!questionnaire.isActive) {
      throw new NotFoundException('Questionnaire not found');
    }
    return questionnaire;
  }

  private async getOwned(user: AuthUser, id: number): Promise<Assessment> {
    const assessment = await this.assessments.findOne({
      where: { id, userId: user.id },
    });
    if (!assessment) {
      throw new NotFoundException('Assessment not found');
    }
    return assessment;
  }

  private assertWritable(assessment: Assessment): void {
    if (assessment.completedAt) {
      throw new ConflictException('Assessment is already completed');
    }
  }

  private findQuestion(
    questionnaire: QuestionnaireDetail,
    questionId: number,
  ): QuestionDetail {
    const question = questionnaire.questions.find(
      (item) => item.id === questionId,
    );
    if (!question) {
      throw new BadRequestException(
        'Question does not belong to this questionnaire',
      );
    }
    if (!question.isActive) {
      throw new BadRequestException('Cannot answer an inactive question');
    }
    return question;
  }

  private buildAnswerRows(
    assessmentId: number,
    question: QuestionDetail,
    dto: UpsertAnswerDto,
  ): Array<Partial<UserAnswer>> {
    const optionIds = this.resolveOptionIds(dto);

    switch (question.type) {
      case QuestionType.SINGLE_CHOICE: {
        if (optionIds.length !== 1) {
          throw new BadRequestException(
            'single_choice requires exactly one answer option',
          );
        }
        this.assertOptionsBelong(question, optionIds);
        return [
          {
            assessmentId,
            questionId: question.id,
            answerOptionId: optionIds[0],
            value: null,
          },
        ];
      }
      case QuestionType.MULTIPLE_CHOICE: {
        if (optionIds.length === 0) {
          throw new BadRequestException(
            'multiple_choice requires at least one answer option',
          );
        }
        this.assertOptionsBelong(question, optionIds);
        return optionIds.map((answerOptionId) => ({
          assessmentId,
          questionId: question.id,
          answerOptionId,
          value: null,
        }));
      }
      case QuestionType.TEXT: {
        this.assertNoOptionIds(optionIds);
        return [
          {
            assessmentId,
            questionId: question.id,
            answerOptionId: null,
            value: this.parseTextValue(dto.value),
          },
        ];
      }
      case QuestionType.NUMBER: {
        this.assertNoOptionIds(optionIds);
        return [
          {
            assessmentId,
            questionId: question.id,
            answerOptionId: null,
            value: this.parseNumberValue(dto.value),
          },
        ];
      }
      case QuestionType.BOOLEAN: {
        this.assertNoOptionIds(optionIds);
        return [
          {
            assessmentId,
            questionId: question.id,
            answerOptionId: null,
            value: this.parseBooleanValue(dto.value),
          },
        ];
      }
      default:
        throw new BadRequestException('Unsupported question type');
    }
  }

  private resolveOptionIds(dto: UpsertAnswerDto): number[] {
    const fromArray = dto.answerOptionIds ?? [];
    const unique = [...new Set(fromArray)];
    if (dto.answerOptionId != null) {
      if (unique.length === 0) {
        return [dto.answerOptionId];
      }
      if (!unique.includes(dto.answerOptionId)) {
        throw new BadRequestException(
          'answerOptionId must be included in answerOptionIds',
        );
      }
    }
    return unique;
  }

  private assertNoOptionIds(optionIds: number[]): void {
    if (optionIds.length > 0) {
      throw new BadRequestException(
        'This question type does not accept answer options',
      );
    }
  }

  private assertOptionsBelong(
    question: QuestionDetail,
    optionIds: number[],
  ): void {
    const allowed = new Set(question.options.map((option) => option.id));
    const invalid = optionIds.filter((id) => !allowed.has(id));
    if (invalid.length > 0) {
      throw new BadRequestException(
        'Answer option does not belong to this question',
      );
    }
  }

  private parseTextValue(value: unknown): string {
    if (typeof value !== 'string') {
      throw new BadRequestException('value must be a non-empty string');
    }
    const trimmed = value.trim();
    if (!trimmed) {
      throw new BadRequestException('value must be a non-empty string');
    }
    return trimmed;
  }

  private parseNumberValue(value: unknown): string {
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) {
        throw new BadRequestException('value must be a finite number');
      }
      return String(value);
    }
    if (typeof value === 'string') {
      const parsed = Number(value.trim());
      if (!Number.isFinite(parsed)) {
        throw new BadRequestException('value must be a finite number');
      }
      return String(parsed);
    }
    throw new BadRequestException('value must be a finite number');
  }

  private parseBooleanValue(value: unknown): 'true' | 'false' {
    if (value === true || value === 'true') return 'true';
    if (value === false || value === 'false') return 'false';
    throw new BadRequestException('value must be true or false');
  }

  private hasValidStoredAnswer(
    question: QuestionDetail,
    answers: UserAnswer[],
  ): boolean {
    const rows = answers.filter((row) => row.questionId === question.id);
    if (rows.length === 0) return false;

    switch (question.type) {
      case QuestionType.SINGLE_CHOICE:
        return (
          rows.length === 1 &&
          rows[0].answerOptionId != null &&
          question.options.some(
            (option) => option.id === rows[0].answerOptionId,
          )
        );
      case QuestionType.MULTIPLE_CHOICE: {
        const optionIds = rows.map((row) => row.answerOptionId);
        if (optionIds.some((id) => id == null)) return false;
        const unique = new Set(optionIds);
        if (unique.size !== optionIds.length) return false;
        return optionIds.every((id) =>
          question.options.some((option) => option.id === id),
        );
      }
      case QuestionType.TEXT:
        return rows.length === 1 && Boolean(rows[0].value?.trim());
      case QuestionType.NUMBER:
        return (
          rows.length === 1 &&
          rows[0].value != null &&
          Number.isFinite(Number(rows[0].value))
        );
      case QuestionType.BOOLEAN:
        return (
          rows.length === 1 &&
          (rows[0].value === 'true' || rows[0].value === 'false')
        );
      default:
        return false;
    }
  }

  private toView(
    assessment: Assessment,
    answers?: UserAnswer[],
  ): AssessmentView {
    return {
      id: assessment.id,
      userId: assessment.userId,
      questionnaireId: assessment.questionnaireId,
      createdAt: assessment.createdAt,
      completedAt: assessment.completedAt,
      ...(answers
        ? {
            answers: answers.map((row) => ({
              id: row.id,
              questionId: row.questionId,
              answerOptionId: row.answerOptionId,
              value: row.value,
            })),
          }
        : {}),
    };
  }
}
