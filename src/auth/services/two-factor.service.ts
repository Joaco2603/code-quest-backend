import { ForbiddenException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { generateSecret, generateURI, verifySync } from 'otplib';
import * as QRCode from 'qrcode';
import { UserService } from '../../user/user.service.js';
import { ConfigService } from '@nestjs/config';
import { EncryptionService } from '../../common/encryption/encryption.service.js';
import { AuditLogService } from '../../common/services/audit-log.service.js';

@Injectable()
export class TwoFactorService {
  private readonly app_name: string;

  constructor(
    private readonly userService: UserService,
    private readonly configService: ConfigService,
    private readonly encryption: EncryptionService,
    private readonly auditLogService: AuditLogService,
  ) {
    this.app_name = this.configService.get<string>('APP_NAME') ?? 'CodeQuest';
  }

  async generateSecretIfNotExists(userId: string) {
    const user = await this.userService.findOneWithSecret(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (user.is_two_factor_enabled) {
      throw new ForbiddenException(
        'Two-factor authentication is already enabled',
      );
    }

    if (user.two_factor_secret && user.is_two_factor_pending) {
      const secret = this.encryption.decrypt(user.two_factor_secret);
      const otpauthUrl = this.buildOtpAuthUrl(user.email, secret);

      await this.auditLogService.recordDomainEvent({
        statusCode: 200,
        outcome: 'warning',
        eventType: 'auth.2fa.secret_reused',
        userId,
        message: 'Reused pending 2FA secret',
      });
      return {
        secret,
        otpauthUrl,
        qr: await QRCode.toDataURL(otpauthUrl),
        pending: true,
      };
    }

    const secret = generateSecret();

    await this.userService.updateTwoFactorState(userId, {
      two_factor_secret: this.encryption.encrypt(secret),
      is_two_factor_pending: true,
    });

    const otpauthUrl = this.buildOtpAuthUrl(user.email, secret);
    await this.auditLogService.recordDomainEvent({
      statusCode: 200,
      outcome: 'success',
      eventType: 'auth.2fa.secret_generated',
      userId,
      message: 'Generated new 2FA secret',
    });

    return {
      secret,
      otpauthUrl,
      qr: await QRCode.toDataURL(otpauthUrl),
      pending: true,
    };
  }

  async verifyCode(userId: string, code: string) {
    const user = await this.userService.findOneWithSecret(userId);

    if (!user?.two_factor_secret) return false;

    const secret = this.encryption.decrypt(user.two_factor_secret);
    return verifySync({
      token: code,
      secret,
    }).valid;
  }

  async confirmEnable(userId: string, code: string) {
    const valid = await this.verifyCode(userId, code);
    if (!valid) {
      throw new UnauthorizedException('Invalid 2FA code');
    }

    return this.enable(userId);
  }

  async enable(userId: string) {
    await this.userService.updateTwoFactorState(userId, {
      is_two_factor_enabled: true,
      is_two_factor_pending: false,
    });
    await this.auditLogService.recordDomainEvent({
      statusCode: 200,
      outcome: 'success',
      eventType: 'auth.2fa.enabled',
      userId,
      message: '2FA enabled',
    });

    return { message: '2FA enabled' };
  }

  async disable(userId: string) {
    await this.userService.updateTwoFactorState(userId, {
      is_two_factor_enabled: false,
      is_two_factor_pending: false,
      two_factor_secret: null,
    });
    await this.auditLogService.recordDomainEvent({
      statusCode: 200,
      outcome: 'warning',
      eventType: 'auth.2fa.disabled',
      userId,
      message: '2FA disabled',
    });

    return { message: '2FA disabled' };
  }

  private buildOtpAuthUrl(email: string, secret: string) {
    return generateURI({
      issuer: this.app_name,
      label: email,
      secret,
    });
  }
}
