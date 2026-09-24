import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
// import { JwtPurpose } from '../interfaces/jwt-purpose.js';
import type { AuthUser } from '../interfaces/auth-user.type.js';

@Injectable()
export class TwoFactorGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<{ user?: AuthUser }>();
    const user = req.user;

    if (!user) {
      throw new ForbiddenException('Unauthorized');
    }

    // Two-factor is disabled. A signed-in user can reach protected routes.
    // if (user.purpose && user.purpose !== JwtPurpose.access) {
    //   throw new ForbiddenException('2FA is required for this resource');
    // }
    //
    // if (!user.is_two_factor_validated) {
    //   throw new ForbiddenException('2FA is required for this resource');
    // }

    return true;
  }
}
