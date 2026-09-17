import {
    IsOptional,
    IsString,
    IsUUID,
    MinLength,
    Matches,
  } from 'class-validator';
  import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
  
  export class ChangePasswordDto {
    @ApiPropertyOptional({
      description:
        'Optional target user id. When omitted, the authenticated user is used.',
      example: 'de69dcfb-ca41-4b7b-9685-aabd64e83982',
    })
    @IsOptional()
    @IsString()
    @IsUUID()
    userId: string;
  
    @ApiProperty({
      description:
        'New password. Must include uppercase, lowercase, and a number or special character.',
      example: 'NewPassword1!',
      minLength: 8,
    })
    @IsString()
    @MinLength(8, { message: 'Password must be at least 8 characters long' })
    @Matches(/((?=.*\d)|(?=.*\W+))(?![.\n])(?=.*[A-Z])(?=.*[a-z]).*$/, {
      message:
        'Password must have at least 1 uppercase, 1 lowercase, and 1 number or special character',
    })
    password: string;
  }