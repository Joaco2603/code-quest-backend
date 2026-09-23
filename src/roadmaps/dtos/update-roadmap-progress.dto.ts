import { ApiProperty } from '@nestjs/swagger';
import { IsInt, Max, Min } from 'class-validator';

export class UpdateRoadmapProgressDto {
  @ApiProperty({
    description: 'Course completion percentage for this roadmap membership.',
    example: 40,
    minimum: 0,
    maximum: 100,
  })
  @IsInt()
  @Min(0)
  @Max(100)
  progress: number;
}
