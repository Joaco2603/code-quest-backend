import { Transform } from 'class-transformer';
import { IsString, Length } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { trim } from './trim.js';

export class NameDto {
  @ApiProperty({ example: 'TypeScript', maxLength: 100 })
  @Transform(trim)
  @IsString()
  @Length(1, 100)
  name: string;
}
