import { ApiProperty } from '@nestjs/swagger';
import { PaginationMetaDto } from '../../../common/dto/api-response.dto.js';
import { QuestionType } from '../enums/question-type.enum.js';

/**
 * Public output contracts for questionnaires, questions and answer options
 * (Etapa 4). Services return these DTOs unwrapped; controllers wrap them
 * once with `toDataResponse` / `toPaginatedResponse`. Ordering
 * (`sortOrder`, then `id`) and null normalization (`value ?? null`,
 * `description ?? null`) live in the serializers, not here.
 * Deactivation/deletion results stay as `{ message, id }` wrapped in
 * `{ data }` in this stage (no migration to 204).
 */
export class AnswerOptionResponseDto {
  @ApiProperty({ description: 'Option id.', example: 100 })
  id: number;

  @ApiProperty({ description: 'Option label.', example: 'JavaScript' })
  label: string;

  @ApiProperty({
    description: 'Option value.',
    nullable: true,
    type: String,
  })
  value: string | null;

  @ApiProperty({ description: 'Order inside the question.', example: 0 })
  sortOrder: number;
}

export class QuestionResponseDto {
  @ApiProperty({ description: 'Question id.', example: 10 })
  id: number;

  @ApiProperty({
    description: 'Question text.',
    example: 'Which languages?',
  })
  question: string;

  @ApiProperty({ description: 'Question type.', enum: QuestionType })
  type: QuestionType;

  @ApiProperty({ description: 'Whether the question is active.' })
  isActive: boolean;

  @ApiProperty({ description: 'Order inside the questionnaire.', example: 0 })
  sortOrder: number;

  @ApiProperty({
    description: 'Answer options ordered by sortOrder then id.',
    type: () => [AnswerOptionResponseDto],
  })
  options: AnswerOptionResponseDto[];
}

export class QuestionnaireResponseDto {
  @ApiProperty({ description: 'Questionnaire id.', example: 1 })
  id: number;

  @ApiProperty({ description: 'Questionnaire title.', example: 'Skills intake' })
  title: string;

  @ApiProperty({
    description: 'Questionnaire description.',
    nullable: true,
    type: String,
  })
  description: string | null;

  @ApiProperty({ description: 'Whether the questionnaire is active.' })
  isActive: boolean;

  @ApiProperty({
    description: 'Creation date in ISO 8601 UTC.',
    example: '2026-01-15T12:00:00.000Z',
  })
  createdAt: string;

  @ApiProperty({
    description: 'Questions ordered by sortOrder then id.',
    type: () => [QuestionResponseDto],
  })
  questions: QuestionResponseDto[];
}

export class QuestionnaireDeactivationResponseDto {
  @ApiProperty({ example: 'Questionnaire deactivated' })
  message: string;

  @ApiProperty({ example: 1 })
  id: number;
}

export class QuestionDeactivationResponseDto {
  @ApiProperty({ example: 'Question deactivated' })
  message: string;

  @ApiProperty({ example: 10 })
  id: number;
}

export class AnswerOptionDeleteResponseDto {
  @ApiProperty({ example: 'Answer option deleted' })
  message: string;

  @ApiProperty({ example: 100 })
  id: number;
}

export class QuestionnaireDataResponseDto {
  @ApiProperty({ type: () => QuestionnaireResponseDto })
  data: QuestionnaireResponseDto;
}

export class QuestionnaireCollectionDataResponseDto {
  @ApiProperty({ type: () => [QuestionnaireResponseDto] })
  data: QuestionnaireResponseDto[];
}

export class QuestionnairePaginatedResponseDto {
  @ApiProperty({ type: () => [QuestionnaireResponseDto] })
  data: QuestionnaireResponseDto[];

  @ApiProperty({ type: () => PaginationMetaDto })
  meta: PaginationMetaDto;
}

export class QuestionDataResponseDto {
  @ApiProperty({ type: () => QuestionResponseDto })
  data: QuestionResponseDto;
}

export class AnswerOptionDataResponseDto {
  @ApiProperty({ type: () => AnswerOptionResponseDto })
  data: AnswerOptionResponseDto;
}

export class QuestionnaireDeactivationDataResponseDto {
  @ApiProperty({ type: () => QuestionnaireDeactivationResponseDto })
  data: QuestionnaireDeactivationResponseDto;
}

export class QuestionDeactivationDataResponseDto {
  @ApiProperty({ type: () => QuestionDeactivationResponseDto })
  data: QuestionDeactivationResponseDto;
}

export class AnswerOptionDeleteDataResponseDto {
  @ApiProperty({ type: () => AnswerOptionDeleteResponseDto })
  data: AnswerOptionDeleteResponseDto;
}
