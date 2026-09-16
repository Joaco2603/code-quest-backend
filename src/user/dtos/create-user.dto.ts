import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ValidRoles } from '../../auth/interfaces/index.js';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateUserDto {
  @ApiProperty({
    description: 'Unique email address for the user account.',
    example: 'client@example.com',
  })
  @IsString()
  @IsEmail()
  @Transform(({ value }) => value?.toLowerCase().trim())
  email: string;

  @ApiProperty({
    description:
      'Initial password. Must include uppercase, lowercase, and a number or special character.',
    example: 'Password1!',
    minLength: 8,
    maxLength: 20,
  })
  @IsString()
  @MinLength(8)
  @MaxLength(20)
  @Matches(/(?:(?=.*\d)|(?=.*\W+))(?![.\n])(?=.*[A-Z])(?=.*[a-z]).*$/, {
    message:
      'The password must have a Uppercase, lowercase letter and a number',
  })
  password: string;

  @ApiProperty({
    description: 'User first name.',
    example: 'Kevin',
    minLength: 2,
    maxLength: 70,
  })
  @IsString()
  @MinLength(2)
  @MaxLength(70)
  @Transform(({ value }) => value?.toLowerCase())
  first_name: string;

  @ApiProperty({
    description: 'User last name.',
    example: 'Diaz',
    minLength: 2,
    maxLength: 70,
  })
  @IsString()
  @MinLength(2)
  @MaxLength(70)
  @Transform(({ value }) => value?.toLowerCase())
  last_name: string;

  @ApiProperty({
    description: 'User address or site location.',
    example: 'Code Quest main campus',
    minLength: 5,
    maxLength: 300,
  })
  @IsString()
  @MinLength(5)
  @MaxLength(300)
  @Transform(({ value }) => value?.toLowerCase())
  address: string;

  @ApiPropertyOptional({
    description: 'Role assigned to the user.',
    enum: ValidRoles,
    example: ValidRoles.user,
  })
  @IsOptional()
  @IsEnum(ValidRoles, { message: 'Role must be admin, client or user' })
  @Transform(({ value }) => value?.toLowerCase().trim())
  role?: string;

  @ApiPropertyOptional({
    description: 'Client user id that owns this user account.',
    example: 'de69dcfb-ca41-4b7b-9685-aabd64e83982',
  })
  @IsOptional()
  @IsUUID()
  client_id?: string;

  @ApiPropertyOptional({
    description: 'Whether the user account is enabled.',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}