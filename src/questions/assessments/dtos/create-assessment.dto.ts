import { ApiProperty } from '@nestjs/swagger';
import { IsInt, Min } from 'class-validator';

export class CreateAssessmentDto {
  @ApiProperty({
    description: 'Active questionnaire to start.',
    example: 1,
  })
  @IsInt()
  @Min(1)
  questionnaireId: number;
}
