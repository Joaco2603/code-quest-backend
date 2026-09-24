import { ApiProperty } from '@nestjs/swagger';
import { IsInt, Max, Min } from 'class-validator';

export class GenerateRoadmapDto {
  @ApiProperty({
    description: 'Owned assessment whose profile seeds the roadmap.',
    example: 8,
    minimum: 1,
    maximum: 2147483647,
  })
  @IsInt()
  @Min(1)
  @Max(2147483647)
  assessmentId: number;
}
