import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';

// Replace this provider with an adapter to the team's verified authentication.
// Never trust a role supplied through request bodies or headers.
@Injectable()
export class CatalogAdminGuard implements CanActivate {
  canActivate(_context: ExecutionContext): boolean {
    return false;
  }
}
