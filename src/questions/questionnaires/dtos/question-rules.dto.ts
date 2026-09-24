import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsObject,
  Max,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ShowWhenDto {
  @ApiProperty() @IsInt() @Min(1) questionId: number;
  @ApiProperty() @IsInt() @Min(1) answerOptionId: number;
}
export class QuestionRulesDto {
  @ApiPropertyOptional({ default: true })
  @ValidateIf((_o, v) => v !== undefined)
  @IsBoolean()
  required?: boolean;
  @ApiPropertyOptional({ minimum: 1, maximum: 100 })
  @ValidateIf((_o, v) => v !== undefined)
  @IsInt()
  @Min(1)
  @Max(100)
  maxSelections?: number;
  @ApiPropertyOptional({
    default: false,
    description:
      'Allow optional text in value alongside a single-choice option (maximum 1000 characters).',
  })
  @ValidateIf((_o, v) => v !== undefined)
  @IsBoolean()
  allowDetails?: boolean;
  @ApiPropertyOptional({
    type: ShowWhenDto,
    description:
      'Visible only when this option in an unconditional question is selected.',
  })
  @ValidateIf((_o, v) => v !== undefined)
  @IsObject()
  @ValidateNested()
  @Type(() => ShowWhenDto)
  showWhen?: ShowWhenDto;
}
