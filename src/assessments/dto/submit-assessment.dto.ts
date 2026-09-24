import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsString,
  Matches,
  Min,
  ValidateNested,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { AnswerDto } from './answer.dto.js';

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
