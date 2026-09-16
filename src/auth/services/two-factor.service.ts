import { Injectable } from '@nestjs/common';
import { authenticator } from 'otplib';
import * as QRCode from 'qrcode';
import { UserService } from '../../user/user.service';
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
    this.app_name = this.configService.get<string>('APP_NAME');
  }

  async generateSecretIfNotExists(userId: string) {
    const user = await this.userService.findOneWithSecret(userId);

    if (user.two_factor_secret && user.is_two_factor_pending) {
      const secret = this.encryption.decrypt(user.two_factor_secret);

      const otpauthUrl = authenticator.keyuri(
        user.email,
        this.app_name,
        secret,
      );

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

    const secret = authenticator.generateSecret();

    await this.userService.update(userId, {
      two_factor_secret: this.encryption.encrypt(secret),
      is_two_factor_pending: true,
    });

    const otpauthUrl = authenticator.keyuri(user.email, this.app_name, secret);
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

    if (!user.two_factor_secret) return false;

    const secret = this.encryption.decrypt(user.two_factor_secret);

    return authenticator.verify({
      token: code,
      secret: secret,
    });
  }

  async enable(userId: string) {
    await this.userService.update(userId, {
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
    await this.userService.update(userId, {
      is_two_factor_enabled: false,
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
}