import {
    CanActivate,
    ExecutionContext,
    ForbiddenException,
  } from '@nestjs/common';
  
  export class TwoFactorGuard implements CanActivate {
    canActivate(context: ExecutionContext): boolean {
      const req = context.switchToHttp().getRequest();
  
      const user = req.user;
  
      if (!user) {
        throw new ForbiddenException('Unauthorized');
      }
  
      if (!user.is_two_factor_validated) {
        throw new ForbiddenException('2FA is required for this resource');
      }
  
      return true;
    }
  }