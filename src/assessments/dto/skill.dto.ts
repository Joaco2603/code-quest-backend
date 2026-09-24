import { ApiProperty } from '@nestjs/swagger';
import { SkillLevel } from '../../catalog/entities.js';

export class SkillDto {
  @ApiProperty() technologyId: number;
  @ApiProperty({ enum: SkillLevel, nullable: true }) level: SkillLevel | null;
  @ApiProperty({ enum: ['self_reported', 'unknown'] }) source: string;
}
