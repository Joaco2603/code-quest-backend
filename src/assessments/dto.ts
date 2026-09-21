import { Type } from 'class-transformer';
import {
  Allow,
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsString,
  Matches,
  Max,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { AnswerValue, RuleKind } from './contracts.js';

export class OptionMappingDto {
  @ApiProperty() @IsInt() @Min(1) optionId: number;
  @ApiProperty({
    oneOf: [{ type: 'string' }, { type: 'number' }],
    nullable: true,
  })
  @Allow()
  value: string | number | null;
}
export class QuestionRuleDto {
  @ApiProperty() @IsInt() @Min(1) questionId: number;
  @ApiProperty() @IsBoolean() required: boolean;
  @ApiProperty({
    enum: [
      'none',
      'category_interest',
      'technology_interest',
      'goal',
      'self_reported_skill',
    ],
  })
  @IsIn([
    'none',
    'category_interest',
    'technology_interest',
    'goal',
    'self_reported_skill',
  ])
  kind: RuleKind;
  @ApiPropertyOptional()
  @ValidateIf((_o, v) => v !== undefined)
  @IsInt()
  @Min(1)
  technologyId?: number;
  @ApiPropertyOptional()
  @ValidateIf((_o, v) => v !== undefined)
  @IsNumber()
  min?: number;
  @ApiPropertyOptional()
  @ValidateIf((_o, v) => v !== undefined)
  @IsNumber()
  max?: number;
  @ApiPropertyOptional()
  @ValidateIf((_o, v) => v !== undefined)
  @IsInt()
  @Min(1)
  @Max(2000)
  maxLength?: number;
  @ApiPropertyOptional()
  @ValidateIf((_o, v) => v !== undefined)
  @IsInt()
  @Min(1)
  @Max(100)
  maxSelections?: number;
  @ApiProperty({ type: [OptionMappingDto] })
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => OptionMappingDto)
  options: OptionMappingDto[];
}
export class EvaluationDefinitionDto {
  @ApiProperty({ type: [QuestionRuleDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => QuestionRuleDto)
  rules: QuestionRuleDto[];
}
export class AnswerDto {
  @ApiProperty() @IsInt() @Min(1) questionId: number;
  @ApiProperty({
    description:
      'single_choice: option ID; multiple_choice: option IDs; text, number and boolean: native JSON value.',
    oneOf: [
      { type: 'string' },
      { type: 'number' },
      { type: 'boolean' },
      { type: 'array', items: { type: 'integer' } },
    ],
  })
  @Allow()
  value: AnswerValue;
}
export class SubmitAssessmentDto {
  @ApiProperty() @IsInt() @Min(1) questionnaireId: number;
  @ApiProperty({
    description: 'Revision returned by the evaluation form. Refetch on 409.',
  })
  @IsString()
  @Matches(/^[a-f0-9]{64}$/)
  revision: string;
  @ApiProperty({ type: [AnswerDto] })
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => AnswerDto)
  answers: AnswerDto[];
}
export class AssessmentQueryDto {
  @ApiPropertyOptional({ default: 0 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(1000000)
  offset = 0;
  @ApiPropertyOptional({ default: 20 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;
}
