import { UseGuards, applyDecorators } from '@nestjs/common';
import { ValidRoles } from '../interfaces/index.js';
import { RolesProtected } from './roles-protected/roles-protected.decorator.js';
import { AuthGuard } from '@nestjs/passport';
import { UserRoleGuard } from '../guards/user-role/user-role.guard.js';
import { TwoFactorGuard } from '../guards/two-factor.guard.js';

export const Auth = (...roles: ValidRoles[]) => {
  return applyDecorators(
    RolesProtected(...roles),
    UseGuards(AuthGuard(), TwoFactorGuard, UserRoleGuard),
  );
};