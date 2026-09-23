import { describe, expect, it } from 'vitest';
import { accessTokenMatchesAccount } from '../helpers/access-token-policy.js';
import { JwtPurpose } from '../interfaces/jwt-purpose.js';
import { ValidRoles } from '../interfaces/valid-roles.type.js';

describe('accessTokenMatchesAccount', () => {
  const ordinary = {
    role: ValidRoles.user,
    is_two_factor_enabled: false,
  };

  it('accepts a standard session that never enrolled 2FA', () => {
    expect(
      accessTokenMatchesAccount(ordinary, {
        sub: 'user-1',
        purpose: JwtPurpose.access,
        is_two_factor_enabled: false,
        is_two_factor_validated: true,
      }),
    ).toBe(true);
  });

  it('rejects that session after 2FA is enabled', () => {
    expect(
      accessTokenMatchesAccount(
        { ...ordinary, is_two_factor_enabled: true },
        {
          sub: 'user-1',
          purpose: JwtPurpose.access,
          is_two_factor_enabled: false,
          is_two_factor_validated: true,
        },
      ),
    ).toBe(false);
  });

  it('rejects that session after the account becomes privileged', () => {
    expect(
      accessTokenMatchesAccount(
        { role: ValidRoles.admin, is_two_factor_enabled: false },
        {
          sub: 'user-1',
          purpose: JwtPurpose.access,
          is_two_factor_enabled: false,
          is_two_factor_validated: true,
        },
      ),
    ).toBe(false);
  });

  it('accepts a privileged session that completed 2FA', () => {
    expect(
      accessTokenMatchesAccount(
        { role: ValidRoles.client, is_two_factor_enabled: true },
        {
          sub: 'user-1',
          purpose: JwtPurpose.access,
          is_two_factor_enabled: true,
          is_two_factor_validated: true,
        },
      ),
    ).toBe(true);
  });

  it('still accepts a challenge token so setup can finish', () => {
    expect(
      accessTokenMatchesAccount(
        { role: ValidRoles.admin, is_two_factor_enabled: false },
        {
          sub: 'user-1',
          purpose: JwtPurpose.twoFactor,
          is_two_factor_enabled: false,
          is_two_factor_validated: false,
        },
      ),
    ).toBe(true);
  });
});
