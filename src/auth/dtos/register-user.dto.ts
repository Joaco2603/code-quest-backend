import { PickType } from '@nestjs/swagger';
import { CreateUserDto } from '../../user/dtos/create-user.dto.js';

export class RegisterUserDto extends PickType(CreateUserDto, [
  'email',
  'password',
  'first_name',
  'last_name',
] as const) {}
