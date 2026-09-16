import {
    CanActivate,
    ExecutionContext,
    ForbiddenException,
    Injectable,
  } from '@nestjs/common';
  
  @Injectable()
  export class ChangePasswordGuard implements CanActivate {
    canActivate(context: ExecutionContext): boolean {
      const req = context.switchToHttp().getRequest<{
        user?: {
          mustChangePassword?: boolean;
          isRecovery?: boolean;
        };
      }>();
  
      if (!req.user) {
        throw new ForbiddenException('Unauthorized');
      }
  
      if (!req.user.mustChangePassword && !req.user.isRecovery) {
        throw new ForbiddenException('Password change token is required');
      }
  
      return true;
    }
  }