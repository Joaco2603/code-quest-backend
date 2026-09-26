import { ApiProperty } from '@nestjs/swagger';
import { IsInt, Min } from 'class-validator';

export class GenerateRoadmapDto {
  @ApiProperty({
    description:
      'Completed personal questionnaire attempt. The generated roadmap is always personal.',
    example: 12,
  })
  @IsInt()
  @Min(1)
  assessmentId: number;
}
