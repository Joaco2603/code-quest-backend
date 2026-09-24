import { ApiProperty } from '@nestjs/swagger';
import { QuestionnaireResponseDto } from '../../questions/questionnaires/dtos/questionnaire-response.dto.js';
import { EvaluationDefinitionDto } from './evaluation-definition.dto.js';

export class EvaluationSnapshotDto {
  @ApiProperty({ type: QuestionnaireResponseDto })
  questionnaire: QuestionnaireResponseDto;
  @ApiProperty({ type: EvaluationDefinitionDto })
  definition: EvaluationDefinitionDto;
  @ApiProperty() profileVersion: number;
  @ApiProperty() revision: string;
}
