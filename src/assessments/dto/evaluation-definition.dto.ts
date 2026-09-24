import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  ValidateNested,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { QuestionRuleDto } from './question-rule.dto.js';

export class EvaluationDefinitionDto {
  @ApiProperty({ type: [QuestionRuleDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => QuestionRuleDto)
  rules: QuestionRuleDto[];
}
