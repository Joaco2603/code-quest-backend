import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { JwtPurpose } from '../interfaces/jwt-purpose.js';
import type { AuthUser } from '../interfaces/auth-user.type.js';

@Injectable()
export class TwoFactorGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<{ user?: AuthUser }>();
    const user = req.user;

    if (!user) {
      throw new ForbiddenException('Unauthorized');
    }

    // MFA is disabled for the MVP, but temporary tokens remain restricted.
    if (
      user.purpose !== JwtPurpose.access ||
      user.isRecovery ||
      user.mustChangePassword
    ) {
      throw new ForbiddenException('A full access session is required');
    }

    return true;
  }
}
