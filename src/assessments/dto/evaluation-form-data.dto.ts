import { ApiProperty } from '@nestjs/swagger';
import { EvaluationSnapshotDto } from './evaluation-snapshot.dto.js';

export class EvaluationFormDataDto {
  @ApiProperty({ type: EvaluationSnapshotDto }) data: EvaluationSnapshotDto;
}
