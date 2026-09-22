import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { describe, expect, it, vi } from 'vitest';
import { META_ROLES } from '../decorators/roles-protected/roles-protected.decorator.js';
import { UserRoleGuard } from '../guards/user-role/user-role.guard.js';
import { ValidRoles } from '../interfaces/valid-roles.type.js';

describe('UserRoleGuard', () => {
  const handler = function updateQuestion() {};
  const controller = class QuestionsController {};

  function contextFor(user: { role?: string; fullName?: string } | undefined) {
    return {
      getHandler: () => handler,
      getClass: () => controller,
      switchToHttp: () => ({
        getRequest: () => ({ user }),
      }),
    } as unknown as ExecutionContext;
  }

  it('rejects a standard user when only the class declares admin', () => {
    const reflector = {
      getAllAndOverride: vi.fn().mockReturnValue([ValidRoles.admin]),
    };
    const guard = new UserRoleGuard(reflector as unknown as Reflector);

    expect(() =>
      guard.canActivate(
        contextFor({ role: ValidRoles.user, fullName: 'Smoke User' }),
      ),
    ).toThrow(ForbiddenException);
    expect(reflector.getAllAndOverride).toHaveBeenCalledWith(META_ROLES, [
      handler,
      controller,
    ]);
  });

  it('lets the method metadata override the class', () => {
    const reflector = {
      getAllAndOverride: vi.fn().mockReturnValue([ValidRoles.user]),
    };
    const guard = new UserRoleGuard(reflector as unknown as Reflector);

    expect(
      guard.canActivate(
        contextFor({ role: ValidRoles.user, fullName: 'Smoke User' }),
      ),
    ).toBe(true);
  });

  it('allows the request when neither class nor method declares roles', () => {
    const reflector = {
      getAllAndOverride: vi.fn().mockReturnValue(undefined),
    };
    const guard = new UserRoleGuard(reflector as unknown as Reflector);

    expect(guard.canActivate(contextFor({ role: ValidRoles.user }))).toBe(true);
  });
});
