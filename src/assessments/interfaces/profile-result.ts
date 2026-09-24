import type { SkillLevel } from '../../catalog/entities.js';

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
