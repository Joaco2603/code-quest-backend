import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt.guard.js';
import type { AuthUser } from '../../auth/interfaces/auth-user.type.js';
import { JwtPurpose } from '../../auth/interfaces/jwt-purpose.js';
import { ValidRoles } from '../../auth/interfaces/valid-roles.type.js';

/**
 * Admin catalog access uses the verified access token, never a role sent in
 * the body or in a header. A full access session with role `admin` is required.
 */
export function assertCatalogAdmin(user: AuthUser | undefined): void {
  if (!user) {
    throw new UnauthorizedException('Invalid or expired token');
  }

  if (
    user.purpose !== JwtPurpose.access ||
    user.isRecovery ||
    user.mustChangePassword
  ) {
    throw new ForbiddenException('A full access session is required');
  }

  if (user.role !== ValidRoles.admin) {
    throw new ForbiddenException('Admin role required');
  }
}

@Injectable()
export class CatalogAdminGuard implements CanActivate {
  private readonly jwt = new JwtAuthGuard();

  canActivate(context: ExecutionContext): boolean | Promise<boolean> {
    if (typeof context.switchToHttp !== 'function') return false;
    return this.activate(context);
  }

  private async activate(context: ExecutionContext): Promise<boolean> {
    const authenticated = await Promise.resolve(
      this.jwt.canActivate(context) as boolean | Promise<boolean>,
    );
    if (!authenticated) return false;

    const user = context.switchToHttp().getRequest<{ user?: AuthUser }>().user;
    assertCatalogAdmin(user);
    return true;
  }
}
