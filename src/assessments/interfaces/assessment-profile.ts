import type { ProfileResult } from './profile-result.js';

export interface AssessmentProfile extends ProfileResult {
  assessmentId: number;
  questionnaireId: number;
  profileVersion: number;
  completedAt: string;
}
