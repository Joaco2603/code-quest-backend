import type { QuestionnaireResponseDto } from '../../questions/dtos/questionnaire-response.dto.js';
import type { EvaluationDefinition } from './evaluation-definition.js';

export interface EvaluationSnapshot {
  questionnaire: QuestionnaireResponseDto;
  definition: EvaluationDefinition;
  revision: string;
  profileVersion: number;
}
