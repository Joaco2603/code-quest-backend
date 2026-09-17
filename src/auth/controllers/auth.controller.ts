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
} from '../dtos/index.js';
import { AuthGuard } from '@nestjs/passport';
import { GetUser } from '../decorators/get-user.decorators.js';
import type { AuthUser } from '../interfaces/auth-user.type.js';
import { JwtAuthGuard } from '../guards/jwt.guard.js';
import { ValidRoles } from '../interfaces/index.js';
import { Auth } from '../decorators/index.js';
import { RateLimit } from '../../common/decorators/rate-limit.decorator.js';
import { PendingTwoFactorGuard } from '../guards/pending-two-factor.guard.js';
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
  ApiBody,
  ApiCreatedResponse,
  ApiFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiUnauthorizedResponse,
  ApiTags,
} from '@nestjs/swagger';

@ApiTags('Code Quest Used Endpoints', 'Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Register a user',
    description:
      'Creates a new user. Admins can choose the role; clients can only create child users.',
  })
  @ApiCreatedResponse({
    description: 'User created successfully.',
    schema: {
      example: {
        id: 'de69dcfb-ca41-4b7b-9685-aabd64e83982',
        email: 'operator@example.com',
        first_name: 'operator',
        last_name: 'quest',
        role: 'user',
        isActive: true,
      },
    },
  })
  @ApiBadRequestResponse({
    description: 'Invalid user payload or duplicated email.',
    schema: { example: { statusCode: 400, message: 'Email already exists' } },
  })
  @ApiUnauthorizedResponse({
    description: 'Missing or invalid bearer token.',
  })
  @UseGuards(AuthGuard())
  @Auth(ValidRoles.admin, ValidRoles.client)
  create(@GetUser() user: AuthUser, @Body() createUserDto: CreateUserDto) {
    if (user.role === ValidRoles.client) {
      return this.authService.create({
        ...createUserDto,
        role: 'user',
        client_id: user.id,
      });
    }
    return this.authService.create(createUserDto);
  }

  @Post('register/user')
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Register a standard user',
    description: 'Admin-only shortcut that creates a user with the user role.',
  })
  @ApiCreatedResponse({
    description: 'Standard user created successfully.',
    schema: {
      example: {
        id: 'de69dcfb-ca41-4b7b-9685-aabd64e83982',
        email: 'user@example.com',
        role: 'user',
        isActive: true,
      },
    },
  })
  @Auth(ValidRoles.admin)
  createUser(@Body() createUserDto: CreateUserDto) {
    return this.authService.create({ ...createUserDto, role: 'user' });
  }

  @Post('login')
  @ApiOperation({
    summary: 'Authenticate user',
    description:
      'Validates email and password. The response may require 2FA verification before full access.',
  })
  @ApiCreatedResponse({
    description:
      'Login accepted. Response may include a temporary token for 2FA/password change or an access token.',
    schema: {
      oneOf: [
        {
          example: {
            requires2FA: true,
            tempToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
            userId: '43566ec8-22af-41d3-933a-918b536fe99f',
            role: 'user',
          },
        },
        {
          example: {
            accessToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
            refreshToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
            role: 'client',
            user: {
              id: 'de69dcfb-ca41-4b7b-9685-aabd64e83982',
              email: 'client@example.com',
              first_name: 'client',
            },
          },
        },
      ],
    },
  })
  @ApiUnauthorizedResponse({
    description: 'Invalid credentials.',
    schema: { example: { statusCode: 401, message: 'Invalid credentials' } },
  })
  @RateLimit(5, 60_000)
  loginUser(@Body() loginUserDto: LoginUserDto) {
    return this.authService.loginUser(loginUserDto);
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
    schema: {
      example: {
        url: 'https://discord.com/oauth2/authorize?client_id=abc',
      },
    },
  })
  @UseGuards(JwtAuthGuard, TwoFactorGuard)
  @RateLimit(10, 60_000)
  linkDiscord(@GetUser() user: AuthUser, @Res() res: Response) {
    const started = this.authService.beginDiscordLink(user);
    this.setDiscordOAuthCookie(res, started.cookieValue);
    return res.json({ url: started.url });
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
    schema: {
      example: {
        code: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
      },
    },
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
      'Consumes the one-time ticket from /auth/discord/callback and returns a session, or the same 2FA/password-change challenge used by password login.',
  })
  @ApiCreatedResponse({
    description: 'Discord login completed or pending a follow-up challenge.',
    schema: {
      example: {
        access_token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
        user: {
          id: '43566ec8-22af-41d3-933a-918b536fe99f',
          email: 'student@example.com',
          role: 'user',
        },
      },
    },
  })
  @ApiUnauthorizedResponse({
    description: 'Invalid, expired, or reused Discord login ticket.',
  })
  @RateLimit(10, 60_000)
  exchangeDiscord(@Body() dto: ExchangeDiscordDto) {
    return this.authService.exchangeDiscordTicket(dto.code);
  }

  @Get('renovated')
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Refresh authenticated session',
    description: 'Returns the current authenticated user and refreshed auth data.',
  })
  @ApiOkResponse({
    description: 'Authenticated session data.',
    schema: {
      example: {
        user: {
          id: '43566ec8-22af-41d3-933a-918b536fe99f',
          email: 'operator@example.com',
          role: 'user',
        },
        token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
      },
    },
  })
  @UseGuards(AuthGuard())
  checkAuthStatus(@GetUser() user: AuthUser) {
    return this.authService.checkAuthStatus(user);
  }

  @UseGuards(JwtAuthGuard, PendingTwoFactorGuard)
  @Post('2fa/verify')
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Verify 2FA code',
    description:
      'Completes login for users that have a pending two-factor authentication challenge.',
  })
  @ApiCreatedResponse({
    description: '2FA code verified and access token issued.',
    schema: {
      example: {
        accessToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
        refreshToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
        role: 'user',
        user: {
          id: '43566ec8-22af-41d3-933a-918b536fe99f',
          email: 'operator@example.com',
        },
      },
    },
  })
  @ApiUnauthorizedResponse({
    description: 'Invalid or expired temporary token/code.',
  })
  @RateLimit(5, 60_000)
  async verify(
    @Req() req: { user: AuthUser },
    @Body() dto: Verify2FADto,
  ) {
    return this.authService.verify2FA(req.user.id, dto.code);
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
    schema: { example: { message: 'Password changed successfully' } },
  })
  @ApiBadRequestResponse({
    description: 'Password does not satisfy validation rules.',
  })
  @RateLimit(5, 60_000)
  changePassword(
    @Req() req: { user: AuthUser },
    @Body() changePasswordDto: ChangePasswordDto,
  ) {
    return this.authService.changePassword(req.user.id, changePasswordDto);
  }

  @Post('forgot-password-2fa')
  @ApiOperation({
    summary: 'Verify recovery 2FA code',
    description:
      'Validates a two-factor code during the password recovery workflow.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['email', 'code'],
      properties: {
        email: {
          type: 'string',
          format: 'email',
          example: 'operator@example.com',
        },
        code: { type: 'string', example: '123456' },
      },
    },
  })
  @ApiCreatedResponse({
    description: 'Recovery 2FA code verified and temporary token returned.',
    schema: {
      example: {
        tempToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
        userId: '43566ec8-22af-41d3-933a-918b536fe99f',
      },
    },
  })
  @ApiBadRequestResponse({
    description: 'Invalid email/code combination.',
  })
  @RateLimit(5, 60_000)
  forgotPassword2FA(@Body() body: { email: string; code: string }) {
    return this.authService.verify2FAForRecovery(body.email, body.code);
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
      return res.json({ code: payload.code });
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