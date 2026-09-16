import { PartialType } from '@nestjs/mapped-types';
import { CreateUserDto } from './create-user.dto.js';
import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class UpdateUserDto extends PartialType(CreateUserDto) {
  @IsOptional()
  @IsString()
  two_factor_secret?: string | null;

  @IsOptional()
  @IsBoolean()
  is_two_factor_enabled?: boolean;

  @IsOptional()
  @IsBoolean()
  is_two_factor_pending?: boolean;
}
