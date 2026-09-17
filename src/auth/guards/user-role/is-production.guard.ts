import {
    CanActivate,
    ExecutionContext,
    Injectable,
    ForbiddenException,
  } from '@nestjs/common';
  import { Observable } from 'rxjs';
  
  @Injectable()
  export class IsProductionGuard implements CanActivate {
    canActivate(
      context: ExecutionContext,
    ): boolean | Promise<boolean> | Observable<boolean> {
      const isProduction = process.env.NODE_ENV === 'production';
  
      if (isProduction) {
        throw new ForbiddenException(
          'Seed operations are not allowed in production environment',
        );
      }
  
      return true;
    }
  }