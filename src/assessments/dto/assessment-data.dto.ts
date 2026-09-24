import { ApiProperty } from '@nestjs/swagger';
import { AssessmentDetailDto } from './assessment-detail.dto.js';

export class AssessmentDataDto {
  @ApiProperty({ type: AssessmentDetailDto }) data: AssessmentDetailDto;
}
