import { UnauthorizedException } from '@nestjs/common';
import type { DiscordOAuthErrorCode } from '../helpers/oauth-state.js';

export class DiscordOAuthException extends UnauthorizedException {
  constructor(
    readonly errorCode: DiscordOAuthErrorCode,
    message = 'Discord login failed',
  ) {
    super(message);
  }
}
