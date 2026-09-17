import { IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ListUsersByClientDto {
  @ApiProperty({
    description: 'Client user id whose child users should be listed.',
    example: 'de69dcfb-ca41-4b7b-9685-aabd64e83982',
  })
  @IsUUID()
  user_id: string;
}
