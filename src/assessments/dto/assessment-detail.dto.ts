import { ApiProperty } from '@nestjs/swagger';
import { AnswerDto } from './answer.dto.js';
import { AssessmentProfileDto } from './assessment-profile.dto.js';
import { EvaluationSnapshotDto } from './evaluation-snapshot.dto.js';

export class AssessmentDetailDto {
  @ApiProperty({ type: AssessmentProfileDto }) profile: AssessmentProfileDto;
  @ApiProperty({ type: EvaluationSnapshotDto }) snapshot: EvaluationSnapshotDto;
  @ApiProperty({ type: [AnswerDto] }) answers: AnswerDto[];
}
