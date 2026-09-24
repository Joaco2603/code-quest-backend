import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  Max,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { RuleKind } from '../interfaces/index.js';
import { OptionMappingDto } from './option-mapping.dto.js';

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
