import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { TwoFactorService } from '../services/two-factor.service.js';
import { UserService } from '../../user/user.service.js';
import { ConfigService } from '@nestjs/config';
import { EncryptionService } from '../../common/encryption/encryption.service.js';
import { AuditLogService } from '../../common/services/audit-log.service.js';
import { generateSecret, generateURI, verifySync } from 'otplib';
import * as QRCode from 'qrcode';
import { vi, type Mock } from 'vitest';

vi.mock('otplib', () => ({
  generateSecret: vi.fn(),
  generateURI: vi.fn(),
  verifySync: vi.fn(),
}));

vi.mock('qrcode', () => ({
  toDataURL: vi.fn(),
}));

describe('TwoFactorService', () => {
  let service: TwoFactorService;

  const mockUser = {
    id: 'user-uuid-123',
    email: 'test@example.com',
    two_factor_secret: null,
    is_two_factor_enabled: false,
    is_two_factor_pending: false,
    role: 'user',
  };

  const mockUserService = {
    findOneWithSecret: vi.fn(),
    updateTwoFactorState: vi.fn(),
  };

  const mockConfigService = {
    get: vi.fn(),
  };

  const mockEncryptionService = {
    encrypt: vi.fn(),
    decrypt: vi.fn(),
  };

  const mockAuditLogService = {
    recordDomainEvent: vi.fn().mockResolvedValue(undefined),
    log: vi.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TwoFactorService,
        {
          provide: UserService,
          useValue: mockUserService,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
        {
          provide: EncryptionService,
          useValue: mockEncryptionService,
        },
        {
          provide: AuditLogService,
          useValue: mockAuditLogService,
        },
      ],
    }).compile();

    service = module.get<TwoFactorService>(TwoFactorService);

    vi.clearAllMocks();

    mockConfigService.get.mockReturnValue('CodeQuest');
    mockAuditLogService.recordDomainEvent.mockResolvedValue(undefined);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('generateSecretIfNotExists', () => {
    const userId = 'user-uuid-123';

    it('should return existing secret if user has pending 2FA setup', async () => {
      const userWithPending = {
        ...mockUser,
        two_factor_secret: 'encrypted-secret',
        is_two_factor_pending: true,
      };
      const decryptedSecret = 'ABCD1234SECRET';
      const otpauthUrl =
        'otpauth://totp/CodeQuest:test@example.com?secret=ABCD1234SECRET';
      const qrDataUrl = 'data:image/png;base64,qrcode';

      mockUserService.findOneWithSecret.mockResolvedValue(userWithPending);
      mockEncryptionService.decrypt.mockReturnValue(decryptedSecret);
      (generateURI as Mock).mockReturnValue(otpauthUrl);
      (QRCode.toDataURL as Mock).mockResolvedValue(qrDataUrl);

      const result = await service.generateSecretIfNotExists(userId);

      expect(result).toEqual({
        secret: decryptedSecret,
        otpauthUrl,
        qr: qrDataUrl,
        pending: true,
      });
      expect(mockUserService.updateTwoFactorState).not.toHaveBeenCalled();
    });

    it('should generate new secret if user does not have one', async () => {
      const userWithoutSecret = { ...mockUser };
      const newSecret = 'NEW-SECRET-123';
      const encryptedSecret = 'encrypted-new-secret';
      const otpauthUrl =
        'otpauth://totp/CodeQuest:test@example.com?secret=NEW-SECRET-123';
      const qrDataUrl = 'data:image/png;base64,newqr';

      mockUserService.findOneWithSecret.mockResolvedValue(userWithoutSecret);
      (generateSecret as Mock).mockReturnValue(newSecret);
      mockEncryptionService.encrypt.mockReturnValue(encryptedSecret);
      (generateURI as Mock).mockReturnValue(otpauthUrl);
      (QRCode.toDataURL as Mock).mockResolvedValue(qrDataUrl);

      const result = await service.generateSecretIfNotExists(userId);

      expect(mockUserService.updateTwoFactorState).toHaveBeenCalledWith(
        userId,
        expect.objectContaining({
          two_factor_secret: encryptedSecret,
          is_two_factor_pending: true,
        }),
      );
      expect(result).toEqual({
        secret: newSecret,
        otpauthUrl,
        qr: qrDataUrl,
        pending: true,
      });
    });

    it('should not replace an already enabled 2FA secret', async () => {
      mockUserService.findOneWithSecret.mockResolvedValue({
        ...mockUser,
        two_factor_secret: 'encrypted-secret',
        is_two_factor_enabled: true,
        is_two_factor_pending: false,
      });

      await expect(service.generateSecretIfNotExists(userId)).rejects.toThrow(
        ForbiddenException,
      );
      expect(mockUserService.updateTwoFactorState).not.toHaveBeenCalled();
    });

    it('should use app name from config for otpauth URI', async () => {
      mockUserService.findOneWithSecret.mockResolvedValue(mockUser);
      (generateSecret as Mock).mockReturnValue('secret');
      mockEncryptionService.encrypt.mockReturnValue('encrypted');
      (QRCode.toDataURL as Mock).mockResolvedValue('qr');

      await service.generateSecretIfNotExists(userId);

      expect(generateURI).toHaveBeenCalledWith({
        issuer: 'CodeQuest',
        label: mockUser.email,
        secret: 'secret',
      });
    });
  });

  describe('verifyCode', () => {
    const userId = 'user-uuid-123';
    const code = '123456';

    it('should return false if user has no secret', async () => {
      mockUserService.findOneWithSecret.mockResolvedValue({
        ...mockUser,
        two_factor_secret: null,
      });

      const result = await service.verifyCode(userId, code);

      expect(result).toBe(false);
      expect(verifySync).not.toHaveBeenCalled();
    });

    it('should verify code against decrypted secret', async () => {
      const encryptedSecret = 'encrypted-secret';
      const decryptedSecret = 'DECRYPTED123';

      mockUserService.findOneWithSecret.mockResolvedValue({
        ...mockUser,
        two_factor_secret: encryptedSecret,
      });
      mockEncryptionService.decrypt.mockReturnValue(decryptedSecret);
      (verifySync as Mock).mockReturnValue({ valid: true });

      const result = await service.verifyCode(userId, code);

      expect(mockEncryptionService.decrypt).toHaveBeenCalledWith(
        encryptedSecret,
      );
      expect(verifySync).toHaveBeenCalledWith({
        token: code,
        secret: decryptedSecret,
      });
      expect(result).toBe(true);
    });

    it('should return false for invalid code', async () => {
      mockUserService.findOneWithSecret.mockResolvedValue({
        ...mockUser,
        two_factor_secret: 'encrypted-secret',
      });
      mockEncryptionService.decrypt.mockReturnValue('secret');
      (verifySync as Mock).mockReturnValue({ valid: false });

      const result = await service.verifyCode(userId, 'wrong-code');

      expect(result).toBe(false);
    });
  });

  describe('enable', () => {
    const userId = 'user-uuid-123';

    it('should update user to enable 2FA', async () => {
      mockUserService.updateTwoFactorState.mockResolvedValue(undefined);

      const result = await service.enable(userId);

      expect(mockUserService.updateTwoFactorState).toHaveBeenCalledWith(
        userId,
        {
          is_two_factor_enabled: true,
          is_two_factor_pending: false,
        },
      );
      expect(result).toEqual({ message: '2FA enabled' });
    });
  });

  describe('disable', () => {
    const userId = 'user-uuid-123';

    it('should update user to disable 2FA and clear secret', async () => {
      mockUserService.updateTwoFactorState.mockResolvedValue(undefined);

      const result = await service.disable(userId);

      expect(mockUserService.updateTwoFactorState).toHaveBeenCalledWith(
        userId,
        {
          is_two_factor_enabled: false,
          is_two_factor_pending: false,
          two_factor_secret: null,
        },
      );
      expect(result).toEqual({ message: '2FA disabled' });
    });
  });
});
