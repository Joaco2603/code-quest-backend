import {
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { TwoFactorGuard } from '../../auth/guards/two-factor.guard.js';
import type { AuthUser } from '../../auth/interfaces/auth-user.type.js';
import { ValidRoles } from '../../auth/interfaces/valid-roles.type.js';

@Injectable()
export class CatalogAdminGuard extends AuthGuard('jwt') {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Passport verifies the token and loads the current role from the database.
    await super.canActivate(context);
    new TwoFactorGuard().canActivate(context);
    const { user } = context.switchToHttp().getRequest<{ user: AuthUser }>();
    if (
      user.role !== ValidRoles.admin ||
      user.mustChangePassword ||
      user.isRecovery
    ) {
      throw new ForbiddenException(
        'A fully authenticated administrator is required',
      );
    }
    return true;
  }
}
