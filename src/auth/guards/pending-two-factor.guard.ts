import {
    CanActivate,
    ExecutionContext,
    ForbiddenException,
    Injectable,
  } from '@nestjs/common';
  
  @Injectable()
  export class PendingTwoFactorGuard implements CanActivate {
    canActivate(context: ExecutionContext): boolean {
      const req = context.switchToHttp().getRequest<{
        user?: {
          is_two_factor_validated?: boolean;
          isRecovery?: boolean;
        };
      }>();
  
      if (!req.user) {
        throw new ForbiddenException('Unauthorized');
      }
  
      if (req.user.isRecovery) {
        throw new ForbiddenException(
          'Recovery token is not valid for 2FA verification',
        );
      }
  
      if (req.user.is_two_factor_validated === true) {
        throw new ForbiddenException('2FA verification already completed');
      }
  
      return true;
    }
  }