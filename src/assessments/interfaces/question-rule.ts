import type { RuleKind } from './rule-kind.js';

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
