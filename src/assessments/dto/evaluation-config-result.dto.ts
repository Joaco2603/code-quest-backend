import { ApiProperty } from '@nestjs/swagger';
import { EvaluationDefinitionDto } from './evaluation-definition.dto.js';

export class EvaluationConfigResultDto {
  @ApiProperty() questionnaireId: number;
  @ApiProperty() profileVersion: number;
  @ApiProperty({ type: EvaluationDefinitionDto })
  definition: EvaluationDefinitionDto;
}
