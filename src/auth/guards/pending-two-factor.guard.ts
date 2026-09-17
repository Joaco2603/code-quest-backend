import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { JwtPurpose } from '../interfaces/jwt-purpose.js';
import type { AuthUser } from '../interfaces/auth-user.type.js';

@Injectable()
export class PendingTwoFactorGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<{ user?: AuthUser }>();

    if (!req.user) {
      throw new ForbiddenException('Unauthorized');
    }

    if (req.user.isRecovery || req.user.purpose === JwtPurpose.recovery) {
      throw new ForbiddenException(
        'Recovery token is not valid for 2FA verification',
      );
    }

    if (req.user.purpose && req.user.purpose !== JwtPurpose.twoFactor) {
      throw new ForbiddenException('A pending 2FA token is required');
    }

    if (req.user.is_two_factor_validated === true) {
      throw new ForbiddenException('2FA verification already completed');
    }

    return true;
  }
}
