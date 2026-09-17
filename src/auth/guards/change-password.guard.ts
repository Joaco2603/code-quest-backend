import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { JwtPurpose } from '../interfaces/jwt-purpose.js';
import type { AuthUser } from '../interfaces/auth-user.type.js';

@Injectable()
export class ChangePasswordGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<{ user?: AuthUser }>();

    if (!req.user) {
      throw new ForbiddenException('Unauthorized');
    }

    const purpose = req.user.purpose;
    const allowedPurpose =
      purpose === JwtPurpose.passwordChange || purpose === JwtPurpose.recovery;

    if (
      !allowedPurpose &&
      !req.user.mustChangePassword &&
      !req.user.isRecovery
    ) {
      throw new ForbiddenException('Password change token is required');
    }

    return true;
  }
}
