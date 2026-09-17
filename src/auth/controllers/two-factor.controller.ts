import { Controller, Post, Req, UseGuards } from '@nestjs/common';
import { TwoFactorService } from '../services/two-factor.service.js';
import { JwtAuthGuard } from '../guards/jwt.guard.js';
import { TwoFactorGuard } from '../guards/two-factor.guard.js';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { AuthUser } from '../interfaces/auth-user.type.js';

@ApiTags('Two-factor authentication')
@ApiBearerAuth('access-token')
@Controller('2fa')
@UseGuards(JwtAuthGuard)
export class TwoFactorController {
  constructor(private readonly twoFactorService: TwoFactorService) {}

  @Post('generate')
  @ApiOperation({
    summary: 'Generate 2FA secret',
    description:
      'Creates or returns the authenticator secret for first-time enrollment. Existing 2FA cannot be replaced from this endpoint.',
  })
  @ApiCreatedResponse({
    description: '2FA secret and QR data.',
    schema: {
      example: {
        secret: 'JBSWY3DPEHPK3PXP',
        otpauthUrl: 'otpauth://totp/CodeQuest:operator@example.com?...',
        qrCodeDataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA...',
      },
    },
  })
  async generate(@Req() req: { user: AuthUser }) {
    return this.twoFactorService.generateSecretIfNotExists(req.user.id);
  }

  @Post('enable')
  @ApiOperation({
    summary: 'Enable 2FA',
    description:
      'Enables two-factor authentication for the authenticated user after enrollment.',
  })
  @ApiCreatedResponse({
    description: '2FA enabled.',
    schema: {
      example: {
        enabled: true,
        message: 'Two-factor authentication enabled',
      },
    },
  })
  async enable(@Req() req: { user: AuthUser }) {
    return this.twoFactorService.enable(req.user.id);
  }

  @Post('disable')
  @UseGuards(TwoFactorGuard)
  @ApiOperation({
    summary: 'Disable 2FA',
    description:
      'Disables two-factor authentication for a fully authenticated user.',
  })
  @ApiCreatedResponse({
    description: '2FA disabled.',
    schema: {
      example: {
        enabled: false,
        message: 'Two-factor authentication disabled',
      },
    },
  })
  async disable(@Req() req: { user: AuthUser }) {
    return this.twoFactorService.disable(req.user.id);
  }
}
