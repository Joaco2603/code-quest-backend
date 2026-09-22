import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayUnique,
  IsArray,
  IsInt,
  IsOptional,
  Min,
} from 'class-validator';

/**
 * Body of PUT /assessments/:id/responses.
 * "Upsert" = update + insert: the same payload creates the answer when none
 * exists and replaces it when the question was already answered.
 */
export class UpsertResponseDto {
  @ApiProperty({ description: 'Question being answered.', example: 10 })
  @IsInt()
  @Min(1)
  questionId: number;

  @ApiPropertyOptional({
    description: 'Selected option for single_choice (alternative to answerOptionIds).',
    example: 3,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  answerOptionId?: number;

  @ApiPropertyOptional({
    description: 'Selected options for multiple_choice (or a single id for single_choice).',
    example: [3, 4],
    type: [Number],
  })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsInt({ each: true })
  @Min(1, { each: true })
  answerOptionIds?: number[];

  @ApiPropertyOptional({
    description: 'Scalar answer for text, number, or boolean questions.',
    example: 'true',
  })
  @IsOptional()
  value?: string | number | boolean;
}
