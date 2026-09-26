import type { ExecutionContext } from '@nestjs/common';
import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { JwtPurpose } from '../../auth/interfaces/jwt-purpose.js';
import { ValidRoles } from '../../auth/interfaces/valid-roles.type.js';
import type { AuthUser } from '../../auth/interfaces/auth-user.type.js';
import {
  assertCatalogAdmin,
  CatalogAdminGuard,
} from '../guards/catalog-admin.guard.js';

function user(overrides: Partial<AuthUser> = {}): AuthUser {
  return {
    id: 'admin-id',
    email: 'admin@example.com',
    is_two_factor_enabled: false,
    is_two_factor_validated: false,
    role: ValidRoles.admin,
    purpose: JwtPurpose.access,
    ...overrides,
  };
}

describe('CatalogAdminGuard', () => {
  it('denies a context that is not an HTTP request', () => {
    expect(new CatalogAdminGuard().canActivate({} as ExecutionContext)).toBe(
      false,
    );
  });
});

describe('assertCatalogAdmin', () => {
  it('accepts an admin access session', () => {
    expect(() => assertCatalogAdmin(user())).not.toThrow();
  });

  it('rejects a missing user, a student, and a temporary session', () => {
    expect(() => assertCatalogAdmin(undefined)).toThrow(UnauthorizedException);
    expect(() => assertCatalogAdmin(user({ role: ValidRoles.user }))).toThrow(
      ForbiddenException,
    );
    expect(() =>
      assertCatalogAdmin(user({ purpose: JwtPurpose.passwordChange })),
    ).toThrow(ForbiddenException);
    expect(() => assertCatalogAdmin(user({ mustChangePassword: true }))).toThrow(
      ForbiddenException,
    );
    expect(() => assertCatalogAdmin(user({ isRecovery: true }))).toThrow(
      ForbiddenException,
    );
  });
});
