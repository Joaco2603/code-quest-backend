import { Allow, IsInt, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class OptionMappingDto {
  @ApiProperty() @IsInt() @Min(1) optionId: number;
  @ApiProperty({
    oneOf: [{ type: 'string' }, { type: 'number' }],
    nullable: true,
  })
  @Allow()
  value: string | number | null;
}
