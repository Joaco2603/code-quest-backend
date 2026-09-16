import { UseGuards, applyDecorators } from '@nestjs/common';
import { ValidRoles } from '../interfaces/index.js';
import { RolesProtected } from './roles-protected/roles-protected.decorator';
import { AuthGuard } from '@nestjs/passport';
import { UserRoleGuard } from '../guards/user-role/user-role.guard';

export const Auth = (...roles: ValidRoles[]) => {
  return applyDecorators(
    RolesProtected(...roles),
    UseGuards(AuthGuard(), UserRoleGuard),
  );
};