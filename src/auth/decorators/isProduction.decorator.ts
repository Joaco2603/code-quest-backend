import { UseGuards, applyDecorators } from '@nestjs/common';
import { IsProductionGuard } from '../guards/user-role/is-production.guard.js';

export const IsProduction = () => {
  return applyDecorators(UseGuards(IsProductionGuard));
};