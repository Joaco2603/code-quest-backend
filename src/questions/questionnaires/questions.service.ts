import { validateAdaptiveQuestions } from './rules/adaptive-questions.js';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PaginationDto } from '../../common/dto/pagination.dto.js';
import { asyncHandler } from '../../common/helpers/async-handler.js';
import { resolvePagination } from '../../common/helpers/pagination.js';
import {
  CreateAnswerOptionDto,
  CreateQuestionDto,
  CreateQuestionnaireDto,
  UpdateAnswerOptionDto,
  UpdateQuestionDto,
  UpdateQuestionnaireDto,
} from './dtos/index.js';
import { AnswerOption } from './entities/answer-option.entity.js';
import { Question } from './entities/question.entity.js';
import { Questionnaire } from './entities/questionnaire.entity.js';
import {
  isChoiceQuestionType,
  QuestionType,
} from './enums/question-type.enum.js';
import {
  serializeAnswerOption,
  serializeQuestion,
  serializeQuestionnaire,
} from './serializers/questions.serializer.js';
import type {
  AnswerOptionDeleteResponseDto,
  AnswerOptionResponseDto,
  QuestionDeactivationResponseDto,
  QuestionResponseDto,
  QuestionnaireDeactivationResponseDto,
  QuestionnaireResponseDto,
} from './dtos/questionnaire-response.dto.js';

@Injectable()
export class QuestionsService {
  constructor(
    @InjectRepository(Questionnaire)
    private readonly questionnaireRepository: Repository<Questionnaire>,
    @InjectRepository(Question)
    private readonly questionRepository: Repository<Question>,
    @InjectRepository(AnswerOption)
    private readonly optionRepository: Repository<AnswerOption>,
  ) {}

  createQuestionnaire = asyncHandler(
    async (dto: CreateQuestionnaireDto): Promise<QuestionnaireResponseDto> => {
      const questionnaire = this.questionnaireRepository.create({
        title: dto.title,
        description: dto.description ?? null,
        isActive: true,
      });
      const saved = await this.questionnaireRepository.save(questionnaire);
      saved.questions = [];
      return serializeQuestionnaire(saved, false);
    },
  );

  listQuestionnaires = asyncHandler(async (paginationDto: PaginationDto) => {
    const { isActive } = paginationDto;
    const { limit, offset } = resolvePagination(paginationDto, 10);
    const where = typeof isActive === 'boolean' ? { isActive } : {};

    const [items, total] = await this.questionnaireRepository.findAndCount({
      where,
      skip: offset,
      take: limit,
      order: { createdAt: 'DESC', id: 'DESC' },
    });

    return {
      items: items.map((item) => serializeQuestionnaire(item, false)),
      total,
      offset,
      limit,
    };
  });

  listActiveQuestionnaires = asyncHandler(async () => {
    const items = await this.questionnaireRepository.find({
      where: { isActive: true },
      order: { createdAt: 'DESC', id: 'DESC' },
    });

    return items.map((item) => serializeQuestionnaire(item, false));
  });

  getActiveQuestionnaire = asyncHandler(
    async (id: number): Promise<QuestionnaireResponseDto> => {
      const questionnaire = await this.loadQuestionnaire(id);
      if (!questionnaire.isActive) {
        throw new NotFoundException(`Questionnaire ${id} was not found`);
      }
      const detail = serializeQuestionnaire(questionnaire, true);
      this.assertChoiceQuestionsHaveOptions(detail);
      validateAdaptiveQuestions(detail.questions);
      return detail;
    },
  );

  getQuestionnaireForAdmin = asyncHandler(
    async (id: number): Promise<QuestionnaireResponseDto> => {
      const questionnaire = await this.loadQuestionnaire(id);
      return serializeQuestionnaire(questionnaire, false);
    },
  );

  updateQuestionnaire = asyncHandler(
    async (
      id: number,
      dto: UpdateQuestionnaireDto,
    ): Promise<QuestionnaireResponseDto> => {
      const questionnaire = await this.loadQuestionnaire(id);
      if (dto.title !== undefined) questionnaire.title = dto.title;
      if (dto.description !== undefined) {
        questionnaire.description = dto.description || null;
      }
      if (dto.isActive !== undefined) questionnaire.isActive = dto.isActive;
      await this.questionnaireRepository.save(questionnaire);
      return serializeQuestionnaire(questionnaire, false);
    },
  );

  deactivateQuestionnaire = asyncHandler(
    async (id: number): Promise<QuestionnaireDeactivationResponseDto> => {
      const questionnaire = await this.loadQuestionnaire(id);
      questionnaire.isActive = false;
      await this.questionnaireRepository.save(questionnaire);
      return { message: 'Questionnaire deactivated', id };
    },
  );

  createQuestion = asyncHandler(
    async (
      questionnaireId: number,
      dto: CreateQuestionDto,
    ): Promise<QuestionResponseDto> => {
      const questionnaire = await this.loadQuestionnaire(questionnaireId);
      validateAdaptiveQuestions([
        ...(questionnaire.questions ?? []),
        {
          id: -1,
          type: dto.type,
          isActive: true,
          options: [],
          rules: dto.rules,
        },
      ]);
      this.assertOptionsAllowed(dto.type, dto.options?.length ?? 0);

      const question = this.questionRepository.create({
        question: dto.question,
        type: dto.type,
        sortOrder: dto.sortOrder,
        rules: dto.rules ?? {},
        isActive: true,
        questionnaire: { id: questionnaireId } as Questionnaire,
      });
      const saved = await this.questionRepository.save(question);

      if (dto.options?.length) {
        const options = dto.options.map((option) =>
          this.optionRepository.create({
            label: option.label,
            value: option.value ?? null,
            sortOrder: option.sortOrder ?? 0,
            question: { id: saved.id } as Question,
          }),
        );
        saved.options = await this.optionRepository.save(options);
      } else {
        saved.options = [];
      }

      return serializeQuestion(saved);
    },
  );

  updateQuestion = asyncHandler(
    async (
      id: number,
      dto: UpdateQuestionDto,
    ): Promise<QuestionResponseDto> => {
      const question = await this.loadQuestion(id);
      const nextType = dto.type ?? question.type;

      if (
        dto.type !== undefined &&
        dto.type !== question.type &&
        !isChoiceQuestionType(nextType) &&
        (question.options?.length ?? 0) > 0
      ) {
        throw new ConflictException(
          'Cannot change question type while answer options exist',
        );
      }

      if (dto.question !== undefined) question.question = dto.question;
      if (dto.type !== undefined) question.type = dto.type;
      if (dto.isActive !== undefined) question.isActive = dto.isActive;
      if (dto.sortOrder !== undefined) question.sortOrder = dto.sortOrder;

      if (dto.rules !== undefined) question.rules = dto.rules;
      const questionnaire = await this.loadQuestionnaire(
        question.questionnaire.id,
      );
      validateAdaptiveQuestions([
        ...(questionnaire.questions ?? []).filter((q) => q.id !== id),
        question,
      ]);
      await this.questionRepository.save(question);
      return serializeQuestion(question);
    },
  );

  deactivateQuestion = asyncHandler(
    async (id: number): Promise<QuestionDeactivationResponseDto> => {
      await this.updateQuestion(id, { isActive: false });
      return { message: 'Question deactivated', id };
    },
  );

  createOption = asyncHandler(
    async (
      questionId: number,
      dto: CreateAnswerOptionDto,
    ): Promise<QuestionResponseDto> => {
      const question = await this.loadQuestion(questionId);
      this.assertOptionsAllowed(question.type, 1);

      const option = this.optionRepository.create({
        label: dto.label,
        value: dto.value ?? null,
        sortOrder: dto.sortOrder ?? 0,
        question: { id: question.id } as Question,
      });
      const saved = await this.optionRepository.save(option);
      question.options = [...(question.options ?? []), saved];
      return serializeQuestion(question);
    },
  );

  updateOption = asyncHandler(
    async (
      id: number,
      dto: UpdateAnswerOptionDto,
    ): Promise<AnswerOptionResponseDto> => {
      const option = await this.loadOption(id);
      if (dto.label !== undefined) option.label = dto.label;
      if (dto.value !== undefined) option.value = dto.value;
      if (dto.sortOrder !== undefined) option.sortOrder = dto.sortOrder;
      await this.optionRepository.save(option);
      return serializeAnswerOption(option);
    },
  );

  deleteOption = asyncHandler(
    async (id: number): Promise<AnswerOptionDeleteResponseDto> => {
      const option = await this.loadOption(id);
      const question = await this.loadQuestion(option.question.id);
      const questionnaire = await this.loadQuestionnaire(
        question.questionnaire.id,
      );
      validateAdaptiveQuestions(
        (questionnaire.questions ?? []).map((q) =>
          q.id === question.id
            ? {
                id: q.id,
                type: q.type,
                isActive: q.isActive,
                rules: q.rules,
                options: q.options.filter((o) => o.id !== id),
              }
            : q,
        ),
      );
      await this.optionRepository.remove(option);
      return { message: 'Answer option deleted', id };
    },
  );

  assertQuestionInQuestionnaire = asyncHandler(
    async (
      questionnaireId: number,
      questionId: number,
    ): Promise<QuestionResponseDto> => {
      const question = await this.loadQuestion(questionId);
      if (question.questionnaire?.id !== questionnaireId) {
        throw new NotFoundException(
          `Question ${questionId} was not found in questionnaire ${questionnaireId}`,
        );
      }
      return serializeQuestion(question);
    },
  );

  private async loadQuestionnaire(id: number): Promise<Questionnaire> {
    const questionnaire = await this.questionnaireRepository.findOne({
      where: { id },
      relations: { questions: { options: true } },
    });
    if (!questionnaire) {
      throw new NotFoundException(`Questionnaire ${id} was not found`);
    }
    return questionnaire;
  }

  private async loadQuestion(id: number): Promise<Question> {
    const question = await this.questionRepository.findOne({
      where: { id },
      relations: { options: true, questionnaire: true },
    });
    if (!question) {
      throw new NotFoundException(`Question ${id} was not found`);
    }
    return question;
  }

  private async loadOption(id: number): Promise<AnswerOption> {
    const option = await this.optionRepository.findOne({
      where: { id },
      relations: { question: true },
    });
    if (!option) {
      throw new NotFoundException(`Answer option ${id} was not found`);
    }
    return option;
  }

  private assertOptionsAllowed(type: QuestionType, optionCount: number) {
    if (!isChoiceQuestionType(type) && optionCount > 0) {
      throw new BadRequestException(
        `Question type ${type} does not accept answer options`,
      );
    }
  }

  private assertChoiceQuestionsHaveOptions(detail: QuestionnaireResponseDto) {
    const incomplete = detail.questions.find(
      (question) =>
        isChoiceQuestionType(question.type) && question.options.length === 0,
    );
    if (incomplete) {
      throw new ConflictException(
        `Choice question ${incomplete.id} has no answer options`,
      );
    }
  }

  // Selection logic lives in the serializers; these thin wrappers keep the
  // previous private API for internal callers that still reference it.
  private toQuestionnaireDetail(
    questionnaire: Questionnaire,
    activeQuestionsOnly: boolean,
  ): QuestionnaireResponseDto {
    return serializeQuestionnaire(questionnaire, activeQuestionsOnly);
  }

  private toQuestionDetail(question: Question): QuestionResponseDto {
    return serializeQuestion(question);
  }
}
