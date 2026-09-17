import { IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ExchangeDiscordDto {
  @ApiProperty({
    description:
      'One-time Discord login ticket returned by /auth/discord/callback.',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
  })
  @IsString()
  @IsNotEmpty()
  code: string;
}
