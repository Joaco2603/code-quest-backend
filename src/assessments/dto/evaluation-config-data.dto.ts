import { ApiProperty } from '@nestjs/swagger';
import { EvaluationConfigResultDto } from './evaluation-config-result.dto.js';

export class EvaluationConfigDataDto {
  @ApiProperty({ type: EvaluationConfigResultDto })
  data: EvaluationConfigResultDto;
}
