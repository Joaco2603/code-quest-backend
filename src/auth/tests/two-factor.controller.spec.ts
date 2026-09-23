import { ValidRoles } from '../interfaces/index.js';
import { TwoFactorController } from '../controllers/two-factor.controller.js';
import { TwoFactorService } from '../services/two-factor.service.js';
import { AuthService } from '../services/auth.service.js';
import { vi } from 'vitest';

describe('TwoFactorController response contracts', () => {
  const actor = {
    id: 'user-uuid-123',
    email: 'operator@example.com',
    role: ValidRoles.user,
    is_two_factor_enabled: false,
    is_two_factor_validated: true,
  };

  const twoFactorService = {
    generateSecretIfNotExists: vi.fn(),
    confirmEnable: vi.fn(),
    disable: vi.fn(),
  };
  const authService = {
    issueVerifiedAccessToken: vi.fn(),
    assertAccountReadyForSessionReplacement: vi.fn(),
  };
  const controller = new TwoFactorController(
    twoFactorService as unknown as TwoFactorService,
    authService as unknown as AuthService,
  );

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('wraps provisioning material in a single data envelope', async () => {
    twoFactorService.generateSecretIfNotExists.mockResolvedValue({
      secret: 'secret123',
      otpauthUrl: 'otpauth://...',
      qr: 'data:image/png;base64,...',
      pending: true,
    });

    const response = await controller.generate({ user: actor });

    expect(twoFactorService.generateSecretIfNotExists).toHaveBeenCalledWith(
      actor.id,
    );
    expect(response).toEqual({
      data: {
        secret: 'secret123',
        otpauthUrl: 'otpauth://...',
        qr: 'data:image/png;base64,...',
        pending: true,
      },
    });
    expect(response).not.toHaveProperty('data.data');
  });

  it('wraps the enable confirmation without provisioning material', async () => {
    const account = { ...actor };
    twoFactorService.confirmEnable.mockResolvedValue({
      message: '2FA enabled',
    });
    authService.assertAccountReadyForSessionReplacement.mockResolvedValue(
      account,
    );
    authService.issueVerifiedAccessToken.mockResolvedValue({
      accessToken: 'replacement-token',
      user: actor,
    });

    const response = await controller.enable(
      { user: actor },
      { code: '123456' },
    );

    expect(
      authService.assertAccountReadyForSessionReplacement,
    ).toHaveBeenCalledWith(actor);
    expect(twoFactorService.confirmEnable).toHaveBeenCalledWith(
      actor.id,
      '123456',
    );
    expect(authService.issueVerifiedAccessToken).toHaveBeenCalledWith(actor, {
      ...account,
      is_two_factor_enabled: true,
    });
    expect(response).toEqual({
      data: { message: '2FA enabled', accessToken: 'replacement-token' },
    });
    expect(response.data).not.toHaveProperty('secret');
  });

  it('refuses to enable 2FA from a password-change token', async () => {
    authService.assertAccountReadyForSessionReplacement.mockRejectedValue(
      new Error('pending challenge'),
    );

    await expect(
      controller.enable(
        {
          user: {
            ...actor,
            purpose: 'password_change' as never,
            mustChangePassword: true,
          },
        },
        { code: '123456' },
      ),
    ).rejects.toThrow('pending challenge');
    expect(twoFactorService.confirmEnable).not.toHaveBeenCalled();
  });

  it('wraps the disable confirmation without provisioning material', async () => {
    const account = { ...actor, is_two_factor_enabled: true };
    twoFactorService.disable.mockResolvedValue({ message: '2FA disabled' });
    authService.assertAccountReadyForSessionReplacement.mockResolvedValue(
      account,
    );
    authService.issueVerifiedAccessToken.mockResolvedValue({
      accessToken: 'replacement-token',
      user: actor,
    });

    const response = await controller.disable({ user: actor });

    expect(twoFactorService.disable).toHaveBeenCalledWith(actor.id);
    expect(authService.issueVerifiedAccessToken).toHaveBeenCalledWith(actor, {
      ...account,
      is_two_factor_enabled: false,
    });
    expect(response).toEqual({
      data: { message: '2FA disabled', accessToken: 'replacement-token' },
    });
    expect(response.data).not.toHaveProperty('secret');
  });
});
