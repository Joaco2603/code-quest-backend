import { ApiProperty } from '@nestjs/swagger';
import { PaginationMetaDto } from '../common/dto/api-response.dto.js';
import { QuestionnaireResponseDto } from '../questions/dtos/questionnaire-response.dto.js';
import { SkillLevel } from '../catalog/entities.js';
import { AnswerDto, EvaluationDefinitionDto } from './dto.js';

export class InterestsDto {
  @ApiProperty({ type: [Number] }) categoryIds: number[];
  @ApiProperty({ type: [Number] }) technologyIds: number[];
}
export class SkillDto {
  @ApiProperty() technologyId: number;
  @ApiProperty({ enum: SkillLevel, nullable: true }) level: SkillLevel | null;
  @ApiProperty({ enum: ['self_reported', 'unknown'] }) source: string;
}
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
export class EvaluationSnapshotDto {
  @ApiProperty({ type: QuestionnaireResponseDto })
  questionnaire: QuestionnaireResponseDto;
  @ApiProperty({ type: EvaluationDefinitionDto })
  definition: EvaluationDefinitionDto;
  @ApiProperty() profileVersion: number;
  @ApiProperty() revision: string;
}
export class AssessmentDetailDto {
  @ApiProperty({ type: AssessmentProfileDto }) profile: AssessmentProfileDto;
  @ApiProperty({ type: EvaluationSnapshotDto }) snapshot: EvaluationSnapshotDto;
  @ApiProperty({ type: [AnswerDto] }) answers: AnswerDto[];
}
export class AssessmentDataDto {
  @ApiProperty({ type: AssessmentDetailDto }) data: AssessmentDetailDto;
}
export class AssessmentListDto {
  @ApiProperty({ type: [AssessmentProfileDto] }) data: AssessmentProfileDto[];
  @ApiProperty({ type: PaginationMetaDto }) meta: PaginationMetaDto;
}
export class EvaluationFormDataDto {
  @ApiProperty({ type: EvaluationSnapshotDto }) data: EvaluationSnapshotDto;
}
export class EvaluationConfigResultDto {
  @ApiProperty() questionnaireId: number;
  @ApiProperty() profileVersion: number;
  @ApiProperty({ type: EvaluationDefinitionDto })
  definition: EvaluationDefinitionDto;
}
export class EvaluationConfigDataDto {
  @ApiProperty({ type: EvaluationConfigResultDto })
  data: EvaluationConfigResultDto;
}
