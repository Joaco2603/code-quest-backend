import {
  Controller,
  Post,
  Req,
  Body,
  UseGuards,
} from '@nestjs/common';
import { TwoFactorService } from '../services/two-factor.service.js';
import { JwtAuthGuard } from '../guards/jwt.guard.js';
import { TwoFactorGuard } from '../guards/two-factor.guard.js';
import {
  Verify2FADto,
  TwoFactorSetupDataResponseDto,
  TwoFactorEnableDataResponseDto,
  TwoFactorDisableDataResponseDto,
} from '../dtos/index.js';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { AuthUser } from '../interfaces/auth-user.type.js';
import { toDataResponse } from '../../common/dto/api-response.dto.js';
import {
  serializeTwoFactorDisable,
  serializeTwoFactorEnable,
  serializeTwoFactorSetup,
} from '../serializers/auth.serializer.js';

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
      'Creates or returns the authenticator secret for first-time enrollment. Existing 2FA cannot be replaced from this endpoint. This is the only general response that carries provisioning material.',
  })
  @ApiCreatedResponse({
    description: '2FA secret and QR data.',
    type: TwoFactorSetupDataResponseDto,
  })
  async generate(@Req() req: { user: AuthUser }) {
    const provisioning = await this.twoFactorService.generateSecretIfNotExists(
      req.user.id,
    );

    return toDataResponse(serializeTwoFactorSetup(provisioning));
  }

  @Post('enable')
  @ApiOperation({
    summary: 'Enable 2FA',
    description:
      'Enables two-factor authentication after verifying a valid TOTP code from the authenticator app.',
  })
  @ApiCreatedResponse({
    description: '2FA enabled.',
    type: TwoFactorEnableDataResponseDto,
  })
  async enable(
    @Req() req: { user: AuthUser },
    @Body() dto: Verify2FADto,
  ) {
    const result = await this.twoFactorService.confirmEnable(
      req.user.id,
      dto.code,
    );

    return toDataResponse(serializeTwoFactorEnable(result));
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
    type: TwoFactorDisableDataResponseDto,
  })
  async disable(@Req() req: { user: AuthUser }) {
    const result = await this.twoFactorService.disable(req.user.id);

    return toDataResponse(serializeTwoFactorDisable(result));
  }
}
