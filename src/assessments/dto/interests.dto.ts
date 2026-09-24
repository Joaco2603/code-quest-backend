import { ApiProperty } from '@nestjs/swagger';

export class InterestsDto {
  @ApiProperty({ type: [Number] }) categoryIds: number[];
  @ApiProperty({ type: [Number] }) technologyIds: number[];
}
