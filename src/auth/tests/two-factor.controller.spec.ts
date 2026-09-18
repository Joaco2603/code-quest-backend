import { ValidRoles } from '../interfaces/index.js';
import { TwoFactorController } from '../controllers/two-factor.controller.js';
import { TwoFactorService } from '../services/two-factor.service.js';
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
  const controller = new TwoFactorController(
    twoFactorService as unknown as TwoFactorService,
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
    twoFactorService.confirmEnable.mockResolvedValue({
      message: '2FA enabled',
    });

    const response = await controller.enable(
      { user: actor },
      { code: '123456' },
    );

    expect(twoFactorService.confirmEnable).toHaveBeenCalledWith(
      actor.id,
      '123456',
    );
    expect(response).toEqual({ data: { message: '2FA enabled' } });
    expect(response.data).not.toHaveProperty('secret');
  });

  it('wraps the disable confirmation without provisioning material', async () => {
    twoFactorService.disable.mockResolvedValue({ message: '2FA disabled' });

    const response = await controller.disable({ user: actor });

    expect(twoFactorService.disable).toHaveBeenCalledWith(actor.id);
    expect(response).toEqual({ data: { message: '2FA disabled' } });
    expect(response.data).not.toHaveProperty('secret');
  });
});
