import { RegisterUserDto } from '../dtos/register-user.dto.js';
import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { AuthService } from '../services/auth.service.js';
import {
  CreateUserDto,
  LoginUserDto,
  Verify2FADto,
  ChangePasswordDto,
  ExchangeDiscordDto,
  LoginPasswordChangeDataResponseDto,
  VerifiedSessionDataResponseDto,
  AuthSessionDataResponseDto,
  PasswordChangeDataResponseDto,
  DiscordLinkDataResponseDto,
  DiscordTicketDataResponseDto,
} from '../dtos/index.js';
import { AuthGuard } from '@nestjs/passport';
import { GetUser } from '../decorators/get-user.decorators.js';
import type { AuthUser } from '../interfaces/auth-user.type.js';
import { JwtAuthGuard } from '../guards/jwt.guard.js';
import { ValidRoles } from '../interfaces/index.js';
import { Auth } from '../decorators/index.js';
import { RateLimit } from '../../common/decorators/rate-limit.decorator.js';
import { ChangePasswordGuard } from '../guards/change-password.guard.js';
import { TwoFactorGuard } from '../guards/two-factor.guard.js';
import { DiscordOAuthException } from '../errors/discord-oauth.exception.js';
import {
  DISCORD_OAUTH_STATE_COOKIE,
  readCookie,
  sanitizeDiscordError,
} from '../helpers/oauth-state.js';
import type { Request, Response } from 'express';
import {
  ApiBearerAuth,
  ApiBadRequestResponse,
  ApiCreatedResponse,
  ApiExtraModels,
  ApiFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiUnauthorizedResponse,
  ApiTags,
  getSchemaPath,
} from '@nestjs/swagger';
import { toDataResponse } from '../../common/dto/api-response.dto.js';
import {
  serializeDiscordExchangeResult,
  serializeDiscordLink,
  serializeDiscordTicket,
  serializePasswordChangeResult,
  serializeRecoveryVerifiedResult,
  serializeSessionStatus,
  serializeVerifiedSession,
  type DiscordExchangeResult,
  type VerifiedSessionResult,
} from '../serializers/auth.serializer.js';

@ApiTags('Code Quest Used Endpoints', 'Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @ApiOperation({
    summary: 'Create a public account',
    description:
      'Creates an active standard user and returns a full session. Privileged fields are rejected.',
  })
  @ApiCreatedResponse({ type: VerifiedSessionDataResponseDto })
  @ApiBadRequestResponse({
    description: 'Invalid payload, or the account could not be created.',
    schema: {
      example: { statusCode: 400, message: 'Unable to create the account' },
    },
  })
  @RateLimit(5, 60_000)
  async register(@Body() dto: RegisterUserDto) {
    const { user, accessToken } = await this.authService.register(dto);
    return toDataResponse(serializeVerifiedSession(user, accessToken));
  }

  @Post('register/managed')
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Register a user',
    description:
      'Creates a new user. Admins can choose the role; clients can only create child users.',
  })
  @ApiCreatedResponse({
    description:
      'User created. The account must change its password before it receives a session.',
    type: LoginPasswordChangeDataResponseDto,
  })
  @ApiBadRequestResponse({
    description: 'Invalid payload, or the account could not be created.',
    schema: {
      example: { statusCode: 400, message: 'Unable to create the account' },
    },
  })
  @ApiUnauthorizedResponse({
    description: 'Missing or invalid bearer token.',
  })
  @UseGuards(AuthGuard(), TwoFactorGuard)
  @Auth(ValidRoles.admin, ValidRoles.client)
  async create(
    @GetUser() user: AuthUser,
    @Body() createUserDto: CreateUserDto,
  ) {
    const created =
      user.role === ValidRoles.client
        ? await this.authService.create({
            ...createUserDto,
            role: 'user',
            client_id: user.id,
          })
        : await this.authService.create(createUserDto);

    return toDataResponse(serializeDiscordExchangeResult(created));
  }

  @Post('register/user')
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Register a standard user',
    description: 'Admin-only shortcut that creates a user with the user role.',
  })
  @ApiCreatedResponse({
    description:
      'Standard user created. The account must change its password before it receives a session.',
    type: LoginPasswordChangeDataResponseDto,
  })
  @Auth(ValidRoles.admin)
  async createUser(@Body() createUserDto: CreateUserDto) {
    const created = await this.authService.create({
      ...createUserDto,
      role: 'user',
    });

    return toDataResponse(serializeDiscordExchangeResult(created));
  }

  @Post('login')
  @ApiOperation({
    summary: 'Authenticate user',
    description:
      'Validates email and password. Returns a full session unless a password change is required. MFA is unavailable in the MVP.',
  })
  @ApiExtraModels(
    VerifiedSessionDataResponseDto,
    LoginPasswordChangeDataResponseDto,
  )
  @ApiCreatedResponse({
    description:
      'Login accepted. Inspect the `data` variant to continue the flow.',
    schema: {
      oneOf: [
        { $ref: getSchemaPath(VerifiedSessionDataResponseDto) },
        { $ref: getSchemaPath(LoginPasswordChangeDataResponseDto) },
      ],
    },
  })
  @ApiUnauthorizedResponse({
    description: 'Invalid credentials.',
    schema: { example: { statusCode: 401, message: 'Invalid credentials' } },
  })
  @RateLimit(5, 60_000)
  async loginUser(@Body() loginUserDto: LoginUserDto) {
    const result = (await this.authService.loginUser(
      loginUserDto,
    )) as DiscordExchangeResult;

    return toDataResponse(serializeDiscordExchangeResult(result));
  }

  @Get('discord')
  @ApiOperation({
    summary: 'Login with Discord',
    description:
      'Redirects the browser to Discord OAuth. After consent, Discord returns to /auth/discord/callback with a one-time ticket, not an access token.',
  })
  @ApiFoundResponse({
    description: 'Redirects to the Discord authorization screen.',
  })
  @RateLimit(10, 60_000)
  discordLogin(@Res() res: Response) {
    const started = this.authService.beginDiscordLogin();
    this.setDiscordOAuthCookie(res, started.cookieValue);
    return res.redirect(started.url);
  }

  @Post('discord/link')
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Link Discord to the current account',
    description:
      'Starts Discord OAuth to attach a Discord identity to the already authenticated user. Requires a fully validated session. Does not link by email match.',
  })
  @ApiOkResponse({
    description: 'Discord authorization URL for the authenticated user.',
    type: DiscordLinkDataResponseDto,
  })
  @UseGuards(JwtAuthGuard, TwoFactorGuard)
  @RateLimit(10, 60_000)
  linkDiscord(@GetUser() user: AuthUser, @Res() res: Response) {
    const started = this.authService.beginDiscordLink(user);
    this.setDiscordOAuthCookie(res, started.cookieValue);
    return res.json(toDataResponse(serializeDiscordLink(started.url)));
  }

  @Get('discord/callback')
  @ApiOperation({
    summary: 'Discord OAuth callback',
    description:
      'Validates the Discord authorization code and PKCE verifier, then redirects to the frontend with a one-time `code` ticket. The frontend must POST that ticket to /auth/discord/exchange.',
  })
  @ApiQuery({ name: 'code', required: false })
  @ApiQuery({ name: 'state', required: false })
  @ApiQuery({ name: 'error', required: false })
  @ApiQuery({
    name: 'format',
    required: false,
    description:
      'Use json to receive the one-time ticket instead of a redirect.',
  })
  @ApiOkResponse({
    description: 'One-time Discord login ticket.',
    type: DiscordTicketDataResponseDto,
  })
  @ApiFoundResponse({
    description: 'Redirects to the frontend with a one-time code or error.',
  })
  @ApiUnauthorizedResponse({
    description: 'Discord denied access or the OAuth state is invalid.',
  })
  @RateLimit(10, 60_000)
  async discordCallback(
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Query('error') error: string | undefined,
    @Query('format') format: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    if (error) {
      this.clearDiscordStateCookie(res);
      return this.respondDiscordLogin(
        res,
        { error: sanitizeDiscordError(error) },
        format,
      );
    }

    const cookieValue = readCookie(
      req.headers.cookie,
      DISCORD_OAUTH_STATE_COOKIE,
    );

    try {
      const result = await this.authService.completeDiscordLogin(
        code,
        state,
        cookieValue,
      );
      this.clearDiscordStateCookie(res);
      return this.respondDiscordLogin(res, result, format);
    } catch (caught) {
      this.clearDiscordStateCookie(res);
      if (format !== 'json' && caught instanceof DiscordOAuthException) {
        const redirectUrl = this.authService.buildDiscordFrontendRedirect({
          error: caught.errorCode,
        });
        if (redirectUrl) {
          return res.redirect(redirectUrl);
        }
      }
      throw caught;
    }
  }

  @Post('discord/exchange')
  @ApiOperation({
    summary: 'Exchange Discord login ticket',
    description:
      'Consumes the one-time ticket from /auth/discord/callback and returns a session wrapped in `data`: either a full session with the serialized user, or a password-change challenge. Tickets are single use.',
  })
  @ApiExtraModels(
    LoginPasswordChangeDataResponseDto,
    VerifiedSessionDataResponseDto,
  )
  @ApiCreatedResponse({
    description: 'Discord login completed or pending a follow-up challenge.',
    schema: {
      oneOf: [
        { $ref: getSchemaPath(VerifiedSessionDataResponseDto) },
        { $ref: getSchemaPath(LoginPasswordChangeDataResponseDto) },
      ],
    },
  })
  @ApiUnauthorizedResponse({
    description: 'Invalid, expired, or reused Discord login ticket.',
  })
  @RateLimit(10, 60_000)
  async exchangeDiscord(@Body() dto: ExchangeDiscordDto) {
    const result = (await this.authService.exchangeDiscordTicket(
      dto.code,
    )) as DiscordExchangeResult;

    return toDataResponse(serializeDiscordExchangeResult(result));
  }

  @Get('renovated')
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Refresh authenticated session',
    description:
      'Returns the current authenticated user and refreshed auth data.',
  })
  @ApiOkResponse({
    description: 'Authenticated session data.',
    type: AuthSessionDataResponseDto,
  })
  @UseGuards(AuthGuard(), TwoFactorGuard)
  async checkAuthStatus(@GetUser() user: AuthUser) {
    const { user: sessionUser, token } =
      (await this.authService.checkAuthStatus(user)) as {
        user: AuthUser;
        token: string;
      };

    return toDataResponse(serializeSessionStatus(sessionUser, token));
  }

  // Not exposed as an HTTP endpoint while MFA is disabled for the MVP.
  async verify(@Req() req: { user: AuthUser }, @Body() dto: Verify2FADto) {
    const { accessToken, user } = (await this.authService.verify2FA(
      req.user.id,
      dto.code,
    )) as VerifiedSessionResult;

    return toDataResponse(serializeVerifiedSession(user, accessToken));
  }

  @UseGuards(JwtAuthGuard, ChangePasswordGuard)
  @Post('change-password')
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Change password',
    description:
      'Changes the password for the authenticated user or, when allowed, the provided target user.',
  })
  @ApiCreatedResponse({
    description: 'Password changed successfully.',
    type: PasswordChangeDataResponseDto,
  })
  @ApiBadRequestResponse({
    description: 'Password does not satisfy validation rules.',
  })
  @RateLimit(5, 60_000)
  async changePassword(
    @Req() req: { user: AuthUser },
    @Body() changePasswordDto: ChangePasswordDto,
  ) {
    const result = (await this.authService.changePassword(
      req.user.id,
      changePasswordDto,
    )) as { message: string };

    return toDataResponse(serializePasswordChangeResult(result));
  }

  // Not exposed as an HTTP endpoint while MFA is disabled for the MVP.
  async forgotPassword2FA(@Body() body: { email: string; code: string }) {
    const result = (await this.authService.verify2FAForRecovery(
      body.email,
      body.code,
    )) as {
      message: string;
      tempToken: string;
      userId: string;
      requiresPasswordChange: true;
    };

    return toDataResponse(serializeRecoveryVerifiedResult(result));
  }

  private respondDiscordLogin(
    res: Response,
    payload: { code?: string; error?: string },
    format?: string,
  ) {
    const redirectUrl = this.authService.buildDiscordFrontendRedirect(payload);

    if (format === 'json' || !redirectUrl) {
      if (payload.error) {
        throw new UnauthorizedException(payload.error);
      }
      return res.json(toDataResponse(serializeDiscordTicket(payload.code!)));
    }

    return res.redirect(redirectUrl);
  }

  private setDiscordOAuthCookie(res: Response, value: string) {
    res.cookie(
      DISCORD_OAUTH_STATE_COOKIE,
      value,
      this.authService.getDiscordStateCookieOptions(),
    );
  }

  private clearDiscordStateCookie(res: Response) {
    res.clearCookie(
      DISCORD_OAUTH_STATE_COOKIE,
      this.authService.getDiscordStateCookieOptions(),
    );
  }
}
