import { ValidRoles } from '../interfaces/index.js';
import { User } from '../../user/entities/user.entity.js';
import {
  serializeAuthSessionUser,
  serializeDiscordExchangeResult,
  serializeDiscordLink,
  serializeDiscordTicket,
  serializeLoginChallenge,
  serializePasswordChangeResult,
  serializeProvisioning,
  serializeRecoveryVerifiedResult,
  serializeRegisteredSession,
  serializeSessionStatus,
  serializeTwoFactorDisable,
  serializeTwoFactorEnable,
  serializeTwoFactorSetup,
  serializeVerifiedSession,
} from '../serializers/auth.serializer.js';

function buildUserEntity(overrides: Partial<User> = {}): User {
  const user = new User();
  user.id = '43566ec8-22af-41d3-933a-918b536fe99f';
  user.email = 'operator@example.com';
  user.discordId = null;
  user.first_name = 'operator';
  user.last_name = 'quest';
  user.address = 'Code Quest main campus';
  user.isActive = true;
  user.role = ValidRoles.user;
  user.client = null;
  user.is_two_factor_enabled = true;
  user.is_two_factor_pending = false;
  user.mustChangePassword = false;
  return Object.assign(user, overrides);
}

describe('auth serializers', () => {
  it('serializes the registered user with the Etapa 2 contract', () => {
    const result = serializeRegisteredSession(
      buildUserEntity({
        password: 'hash-must-not-leak',
        two_factor_secret: 'totp-must-not-leak',
      } as Partial<User>),
      'jwt-token',
    );

    expect(result.token).toBe('jwt-token');
    expect(result.user).toMatchObject({
      id: '43566ec8-22af-41d3-933a-918b536fe99f',
      firstName: 'operator',
      lastName: 'quest',
    });
    expect(result.user).not.toHaveProperty('password');
    expect(JSON.stringify(result)).not.toContain('hash-must-not-leak');
    expect(JSON.stringify(result)).not.toContain('totp-must-not-leak');
  });

  it('maps the session projection to camelCase with null for absent values', () => {
    const result = serializeAuthSessionUser({
      id: 'user-1',
      email: 'operator@example.com',
      role: ValidRoles.admin,
      is_two_factor_enabled: true,
      is_two_factor_validated: false,
    });

    expect(result).toEqual({
      id: 'user-1',
      email: 'operator@example.com',
      role: ValidRoles.admin,
      isTwoFactorEnabled: true,
      isTwoFactorValidated: false,
      clientId: null,
      mustChangePassword: null,
    });
  });

  it('keeps session client and password flags when present', () => {
    const result = serializeSessionStatus(
      {
        id: 'user-1',
        email: 'operator@example.com',
        role: ValidRoles.user,
        is_two_factor_enabled: false,
        is_two_factor_validated: true,
        client_id: 'client-1',
        mustChangePassword: true,
      },
      'refreshed-token',
    );

    expect(result.token).toBe('refreshed-token');
    expect(result.user.clientId).toBe('client-1');
    expect(result.user.mustChangePassword).toBe(true);
  });

  it('keeps provisioning material only on the setup variant', () => {
    const setup = serializeLoginChallenge({
      requiresSetup: true,
      secret: 'secret123',
      otpauthUrl: 'otpauth://...',
      qr: 'data:image/png;base64,...',
      pending: true,
      tempToken: 'temp-token',
    });

    expect(setup).toMatchObject({ requiresSetup: true, secret: 'secret123' });

    const pending2fa = serializeLoginChallenge({
      requires2FA: true,
      tempToken: 'temp-token',
    });
    const passwordChange = serializeLoginChallenge({
      requiresPasswordChange: true,
      userId: 'user-1',
      tempToken: 'temp-token',
    });

    for (const variant of [pending2fa, passwordChange]) {
      expect(variant).not.toHaveProperty('secret');
      expect(variant).not.toHaveProperty('otpauthUrl');
      expect(variant).not.toHaveProperty('qr');
    }
  });

  it('drops unknown extra properties on challenge payloads', () => {
    const result = serializeLoginChallenge(
      Object.assign(
        { requires2FA: true as const, tempToken: 'temp-token' },
        { leakedInternalFlag: true },
      ),
    );

    expect(result).toEqual({ requires2FA: true, tempToken: 'temp-token' });
    expect(result).not.toHaveProperty('leakedInternalFlag');
  });

  it('serializes verified sessions with camelCase tokens and no secrets', () => {
    const result = serializeVerifiedSession(
      buildUserEntity({
        password: 'hash-must-not-leak',
        two_factor_secret: 'totp-must-not-leak',
      } as Partial<User>),
      'access-token',
    );

    expect(result.accessToken).toBe('access-token');
    expect(result).not.toHaveProperty('access_token');
    expect(result.user).toMatchObject({ firstName: 'operator' });
    expect(JSON.stringify(result)).not.toContain('hash-must-not-leak');
    expect(JSON.stringify(result)).not.toContain('totp-must-not-leak');
  });

  it('never exposes provisioning material on verified sessions', () => {
    const result = serializeDiscordExchangeResult({
      accessToken: 'access-token',
      user: buildUserEntity(),
    });

    expect(result).not.toHaveProperty('secret');
    expect(result).not.toHaveProperty('otpauthUrl');
    expect(result).not.toHaveProperty('qr');
  });

  it('serializes discord exchange challenges through the shared variants', () => {
    expect(
      serializeDiscordExchangeResult({
        requiresPasswordChange: true,
        userId: 'user-1',
        tempToken: 'temp-token',
      }),
    ).toEqual({
      requiresPasswordChange: true,
      userId: 'user-1',
      tempToken: 'temp-token',
    });

    expect(
      serializeDiscordExchangeResult({
        requires2FA: true,
        tempToken: 'temp-token',
      }),
    ).toEqual({ requires2FA: true, tempToken: 'temp-token' });
  });

  it('serializes 2FA setup, enable, disable, password and recovery payloads', () => {
    expect(
      serializeTwoFactorSetup({
        secret: 'secret123',
        otpauthUrl: 'otpauth://...',
        qr: 'data:image/png;base64,...',
        pending: true,
      }),
    ).toEqual({
      secret: 'secret123',
      otpauthUrl: 'otpauth://...',
      qr: 'data:image/png;base64,...',
      pending: true,
    });
    expect(serializeProvisioning).toBeDefined();

    expect(
      serializeTwoFactorEnable({
        message: '2FA enabled',
        accessToken: 'replacement-token',
      }),
    ).toEqual({
      message: '2FA enabled',
      accessToken: 'replacement-token',
    });
    expect(
      serializeTwoFactorDisable({
        message: '2FA disabled',
        accessToken: 'replacement-token',
      }),
    ).toEqual({
      message: '2FA disabled',
      accessToken: 'replacement-token',
    });
    expect(
      serializePasswordChangeResult({
        message: 'Password changed successfully',
      }),
    ).toEqual({ message: 'Password changed successfully' });

    expect(
      serializeRecoveryVerifiedResult({
        message: 'Code verified',
        tempToken: 'recovery-token',
        userId: 'user-1',
        requiresPasswordChange: true,
      }),
    ).toEqual({
      message: 'Code verified',
      tempToken: 'recovery-token',
      userId: 'user-1',
      requiresPasswordChange: true,
    });
  });

  it('serializes discord link and ticket payloads without extra fields', () => {
    expect(
      serializeDiscordLink('https://discord.com/oauth2/authorize'),
    ).toEqual({ url: 'https://discord.com/oauth2/authorize' });
    expect(serializeDiscordTicket('ticket-123')).toEqual({
      code: 'ticket-123',
    });
  });
});
