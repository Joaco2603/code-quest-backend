import { ApiProperty } from '@nestjs/swagger';
import { InterestsDto } from './interests.dto.js';
import { SkillDto } from './skill.dto.js';

export class AssessmentProfileDto {
  @ApiProperty() assessmentId: number;
  @ApiProperty() questionnaireId: number;
  @ApiProperty() profileVersion: number;
  @ApiProperty({ format: 'date-time' }) completedAt: string;
  @ApiProperty({ type: InterestsDto }) interests: InterestsDto;
  @ApiProperty({ type: [String] }) goals: string[];
  @ApiProperty({ type: [SkillDto] }) skills: SkillDto[];
  @ApiProperty() readyForGeneration: boolean;
}
