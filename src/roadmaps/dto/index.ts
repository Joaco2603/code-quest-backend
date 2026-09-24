import { ApiProperty } from '@nestjs/swagger';
import { CourseResponseDto } from '../../catalog/dto/catalog-response.dto.js';

export class RoadmapCourseViewDto {
  @ApiProperty({ example: 1 }) courseId: number;
  @ApiProperty({ example: 0, minimum: 0, maximum: 100 }) progress: number;
  @ApiProperty({ example: 0 }) sortOrder: number;
  @ApiProperty({ type: () => CourseResponseDto }) course: CourseResponseDto;
}

export class RoadmapViewDto {
  @ApiProperty({ example: 4 }) id: number;
  @ApiProperty({ example: 'APIs con NestJS' }) title: string;
  @ApiProperty({
    example: 'Empieza por TypeScript y sigue con APIs en NestJS.',
  })
  rationale: string;
  @ApiProperty({ example: 8 }) assessmentId: number;
  @ApiProperty({ format: 'date-time' }) createdAt: string;
  @ApiProperty({ type: () => [RoadmapCourseViewDto] })
  courses: RoadmapCourseViewDto[];
}

export class RoadmapDataDto {
  @ApiProperty({ type: () => RoadmapViewDto }) data: RoadmapViewDto;
}

export class RoadmapListDataDto {
  @ApiProperty({ type: () => [RoadmapViewDto] }) data: RoadmapViewDto[];
}
