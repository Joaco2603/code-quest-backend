import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PaginationDto } from '../common/dto/pagination.dto.js';
import { asyncHandler } from '../common/helpers/async-handler.js';
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
import type {
  QuestionDetail,
  QuestionnaireDetail,
} from './interfaces/index.js';

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
    async (dto: CreateQuestionnaireDto): Promise<QuestionnaireDetail> => {
      const questionnaire = this.questionnaireRepository.create({
        title: dto.title,
        description: dto.description ?? null,
        isActive: true,
      });
      const saved = await this.questionnaireRepository.save(questionnaire);
      saved.questions = [];
      return this.toQuestionnaireDetail(saved, false);
    },
  );

  listQuestionnaires = asyncHandler(async (paginationDto: PaginationDto) => {
    const { offset = 0, isActive } = paginationDto;
    const limit = paginationDto.limit ?? paginationDto.pageSize ?? 10;
    const where = typeof isActive === 'boolean' ? { isActive } : {};

    const [items, total] = await this.questionnaireRepository.findAndCount({
      where,
      skip: offset,
      take: limit,
      order: { createdAt: 'DESC', id: 'DESC' },
    });

    return {
      items: items.map((item) => this.toQuestionnaireDetail(item, false)),
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

    return items.map((item) => this.toQuestionnaireDetail(item, false));
  });

  getActiveQuestionnaire = asyncHandler(
    async (id: number): Promise<QuestionnaireDetail> => {
      const questionnaire = await this.loadQuestionnaire(id);
      if (!questionnaire.isActive) {
        throw new NotFoundException(`Questionnaire ${id} was not found`);
      }
      const detail = this.toQuestionnaireDetail(questionnaire, true);
      this.assertChoiceQuestionsHaveOptions(detail);
      return detail;
    },
  );

  getQuestionnaireForAdmin = asyncHandler(
    async (id: number): Promise<QuestionnaireDetail> => {
      const questionnaire = await this.loadQuestionnaire(id);
      return this.toQuestionnaireDetail(questionnaire, false);
    },
  );

  updateQuestionnaire = asyncHandler(
    async (
      id: number,
      dto: UpdateQuestionnaireDto,
    ): Promise<QuestionnaireDetail> => {
      const questionnaire = await this.loadQuestionnaire(id);
      if (dto.title !== undefined) questionnaire.title = dto.title;
      if (dto.description !== undefined) {
        questionnaire.description = dto.description || null;
      }
      if (dto.isActive !== undefined) questionnaire.isActive = dto.isActive;
      await this.questionnaireRepository.save(questionnaire);
      return this.toQuestionnaireDetail(questionnaire, false);
    },
  );

  deactivateQuestionnaire = asyncHandler(async (id: number) => {
    const questionnaire = await this.loadQuestionnaire(id);
    questionnaire.isActive = false;
    await this.questionnaireRepository.save(questionnaire);
    return { message: 'Questionnaire deactivated', id };
  });

  createQuestion = asyncHandler(
    async (
      questionnaireId: number,
      dto: CreateQuestionDto,
    ): Promise<QuestionDetail> => {
      await this.loadQuestionnaire(questionnaireId);
      this.assertOptionsAllowed(dto.type, dto.options?.length ?? 0);

      const question = this.questionRepository.create({
        question: dto.question,
        type: dto.type,
        sortOrder: dto.sortOrder,
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

      return this.toQuestionDetail(saved);
    },
  );

  updateQuestion = asyncHandler(
    async (id: number, dto: UpdateQuestionDto): Promise<QuestionDetail> => {
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

      await this.questionRepository.save(question);
      return this.toQuestionDetail(question);
    },
  );

  deactivateQuestion = asyncHandler(async (id: number) => {
    const question = await this.loadQuestion(id);
    question.isActive = false;
    await this.questionRepository.save(question);
    return { message: 'Question deactivated', id };
  });

  createOption = asyncHandler(
    async (
      questionId: number,
      dto: CreateAnswerOptionDto,
    ): Promise<QuestionDetail> => {
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
      return this.toQuestionDetail(question);
    },
  );

  updateOption = asyncHandler(async (id: number, dto: UpdateAnswerOptionDto) => {
    const option = await this.loadOption(id);
    if (dto.label !== undefined) option.label = dto.label;
    if (dto.value !== undefined) option.value = dto.value;
    if (dto.sortOrder !== undefined) option.sortOrder = dto.sortOrder;
    await this.optionRepository.save(option);
    return {
      id: option.id,
      label: option.label,
      value: option.value,
      sortOrder: option.sortOrder,
    };
  });

  deleteOption = asyncHandler(async (id: number) => {
    const option = await this.loadOption(id);
    await this.optionRepository.remove(option);
    return { message: 'Answer option deleted', id };
  });

  assertQuestionInQuestionnaire = asyncHandler(
    async (
      questionnaireId: number,
      questionId: number,
    ): Promise<QuestionDetail> => {
      const question = await this.loadQuestion(questionId);
      if (question.questionnaire?.id !== questionnaireId) {
        throw new NotFoundException(
          `Question ${questionId} was not found in questionnaire ${questionnaireId}`,
        );
      }
      return this.toQuestionDetail(question);
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

  private assertChoiceQuestionsHaveOptions(detail: QuestionnaireDetail) {
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

  private toQuestionnaireDetail(
    questionnaire: Questionnaire,
    activeQuestionsOnly: boolean,
  ): QuestionnaireDetail {
    const questions = (questionnaire.questions ?? [])
      .filter((question) => !activeQuestionsOnly || question.isActive)
      .sort(this.bySortThenId)
      .map((question) => this.toQuestionDetail(question));

    return {
      id: questionnaire.id,
      title: questionnaire.title,
      description: questionnaire.description ?? null,
      isActive: questionnaire.isActive,
      createdAt: questionnaire.createdAt,
      questions,
    };
  }

  private toQuestionDetail(question: Question): QuestionDetail {
    const options = [...(question.options ?? [])]
      .sort(this.bySortThenId)
      .map((option) => ({
        id: option.id,
        label: option.label,
        value: option.value ?? null,
        sortOrder: option.sortOrder,
      }));

    return {
      id: question.id,
      question: question.question,
      type: question.type,
      isActive: question.isActive,
      sortOrder: question.sortOrder,
      options,
    };
  }

  private bySortThenId = (
    a: { sortOrder: number; id: number },
    b: { sortOrder: number; id: number },
  ) => a.sortOrder - b.sortOrder || a.id - b.id;
}
