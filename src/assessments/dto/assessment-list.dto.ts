import { ApiProperty } from '@nestjs/swagger';
import { PaginationMetaDto } from '../../common/dto/api-response.dto.js';
import { AssessmentProfileDto } from './assessment-profile.dto.js';

export class AssessmentListDto {
  @ApiProperty({ type: [AssessmentProfileDto] }) data: AssessmentProfileDto[];
  @ApiProperty({ type: PaginationMetaDto }) meta: PaginationMetaDto;
}
