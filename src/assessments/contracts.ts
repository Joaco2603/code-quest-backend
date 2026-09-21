import type { SkillLevel } from '../catalog/entities.js';
import type { QuestionnaireResponseDto } from '../questions/dtos/questionnaire-response.dto.js';

export type RuleKind =
  | 'none'
  | 'category_interest'
  | 'technology_interest'
  | 'goal'
  | 'self_reported_skill';
export type AnswerValue = string | number | boolean | number[];
export interface QuestionRule {
  questionId: number;
  required: boolean;
  kind: RuleKind;
  technologyId?: number;
  min?: number;
  max?: number;
  maxLength?: number;
  maxSelections?: number;
  options: Array<{ optionId: number; value: string | number | null }>;
}
export interface EvaluationDefinition {
  rules: QuestionRule[];
}
export interface ProfileResult {
  interests: { categoryIds: number[]; technologyIds: number[] };
  goals: string[];
  skills: Array<{
    technologyId: number;
    level: SkillLevel | null;
    source: 'self_reported' | 'unknown';
  }>;
  readyForGeneration: boolean;
}
export interface AssessmentProfile extends ProfileResult {
  assessmentId: number;
  questionnaireId: number;
  profileVersion: number;
  completedAt: string;
}
export interface EvaluationSnapshot {
  questionnaire: QuestionnaireResponseDto;
  definition: EvaluationDefinition;
  revision: string;
  profileVersion: number;
}
