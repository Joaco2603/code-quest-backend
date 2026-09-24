import { Assessment } from './assessment.entity.js';
import { EvaluationConfig } from './evaluation-config.entity.js';
import { UserAnswer } from './user-answer.entity.js';

export { Assessment, EvaluationConfig, UserAnswer };
export const assessmentEntities = [EvaluationConfig, Assessment, UserAnswer];
