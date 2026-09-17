import {
  ConflictException,
  ForbiddenException,
  forwardRef,
  Inject,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { BcryptAdapter } from '../adapters/bcrypt.adapter.js';
import {
  LoginUserDto,
  CreateUserDto,
  ChangePasswordDto,
} from '../dtos/index.js';
import { AuthUser } from '../interfaces/auth-user.type.js';
import { JwtPayload } from '../interfaces/jwt-payload.type.js';
import {
  namesFromDiscordProfile,
  type DiscordProfile,
} from '../interfaces/discord-profile.type.js';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UserService } from '../../user/user.service.js';
import { User } from '../../user/entities/user.entity.js';
import { asyncHandler } from '../../common/helpers/async-handler.js';
import { TwoFactorService } from './two-factor.service.js';
import { AuditLogService } from '../../common/services/audit-log.service.js';
import { ValidRoles } from '../interfaces/valid-roles.type.js';
import { DiscordAdapter } from '../adapters/discord.adapter.js';
import { DiscordOAuthException } from '../errors/discord-oauth.exception.js';
import type { DiscordLoginTicketPayload } from '../interfaces/discord-login-ticket.type.js';
import {
  createOAuthState,
  createPkceChallenge,
  createPkceVerifier,
  discordOAuthCookieOptions,
  oauthStatesMatch,
  parseOAuthSession,
  sanitizeDiscordError,
  serializeOAuthSession,
} from '../helpers/oauth-state.js';

@Injectable()
export class AuthService {
  private readonly consumedDiscordTickets = new Map<string, number>();

  constructor(
    @Inject(forwardRef(() => UserService))
    private readonly userService: UserService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly bcryptAdapter: BcryptAdapter,
    private readonly twoFA: TwoFactorService,
    private readonly auditLogService: AuditLogService,
    private readonly discordAdapter: DiscordAdapter,
  ) {}

  create = asyncHandler(async (createUserDto: CreateUserDto) => {
    const { password, role, ...userData } = createUserDto;
    const assignedRole = (role as ValidRoles) || ValidRoles.user;

    if (!Object.values(ValidRoles).includes(assignedRole)) {
      throw new UnauthorizedException('Role not found');
    }

    const user = await this.userService.create({
      ...userData,
      role: assignedRole,
      password,
    });

    return {
      ...user,
      token: this.getJwtToken({
        sub: user.id,
        email: user.email,
        rol: user.role || ValidRoles.user,
        is_two_factor_enabled: user.is_two_factor_enabled,
        is_two_factor_validated: false,
      }),
    };
  });

  createAdmin = asyncHandler(async (createUserDto: CreateUserDto) => {
    const { password, ...userData } = createUserDto;

    const user = await this.userService.create({
      ...userData,
      role: userData.role || ValidRoles.admin,
      password,
    });

    return {
      ...user,
      token: this.getJwtToken({
        sub: user.id,
        email: user.email,
        rol: user.role,
        is_two_factor_enabled: user.is_two_factor_enabled,
        is_two_factor_validated: false,
      }),
    };
  });

  loginUser = asyncHandler(async (loginUserDto: LoginUserDto) => {
    const { email, password } = loginUserDto;

    const user: User = await this.userService.findOneByEmail(email);

    if (!user) {
      await this.auditLogService.recordDomainEvent({
        statusCode: 401,
        outcome: 'error',
        eventType: 'auth.login.failed',
        message: 'Credentials are not valid',
        metadata: { email },
      });
      throw new UnauthorizedException('Credentials are not valid');
    }

    if (!user.role) {
      await this.auditLogService.recordDomainEvent({
        statusCode: 401,
        outcome: 'error',
        eventType: 'auth.login.failed',
        userId: user.id,
        message: 'This user has no role',
        metadata: { email: user.email },
      });
      throw new UnauthorizedException('This user has no role');
    }

    if (!user.isActive) {
      await this.auditLogService.recordDomainEvent({
        statusCode: 401,
        outcome: 'error',
        eventType: 'auth.login.failed',
        userId: user.id,
        userRole: user.role,
        message: 'User is inactive',
        metadata: { email: user.email },
      });
      throw new UnauthorizedException('User is inactive, talk with an admin');
    }

    if (!user.password) {
      await this.auditLogService.recordDomainEvent({
        statusCode: 401,
        outcome: 'error',
        eventType: 'auth.login.failed',
        userId: user.id,
        userRole: user.role,
        message: 'Password login is not available for Discord accounts',
        metadata: { email: user.email },
      });
      throw new UnauthorizedException('This account uses Discord login');
    }

    if (!this.bcryptAdapter.compareHash(password, user.password)) {
      await this.auditLogService.recordDomainEvent({
        statusCode: 401,
        outcome: 'error',
        eventType: 'auth.login.failed',
        userId: user.id,
        userRole: user.role,
        message: 'Credentials are not valid password',
        metadata: { email: user.email },
      });
      throw new UnauthorizedException('Credentials are not valid password');
    }

    const tempToken = this.jwtService.sign({
      sub: user.id,
      email: user.email,
      is_two_factor_enabled: user.is_two_factor_enabled,
      is_two_factor_validated: false,
      rol: user.role,
      client: user.client?.id ?? null,
      mustChangePassword: user.mustChangePassword,
    } satisfies JwtPayload);

    if (user.mustChangePassword) {
      await this.auditLogService.recordDomainEvent({
        statusCode: 200,
        outcome: 'warning',
        eventType: 'auth.login.password_change_required',
        userId: user.id,
        userRole: user.role,
        message: 'User must change password before full access',
        metadata: { email: user.email },
      });
      return {
        requiresPasswordChange: true,
        userId: user.id,
        tempToken,
      };
    }

    if (!user.is_two_factor_enabled) {
      const data = await this.twoFA.generateSecretIfNotExists(user.id);
      await this.auditLogService.recordDomainEvent({
        statusCode: 200,
        outcome: 'warning',
        eventType: 'auth.login.2fa_setup_required',
        userId: user.id,
        userRole: user.role,
        message: '2FA setup required',
        metadata: { email: user.email },
      });

      return {
        requiresSetup: true,
        ...data,
        tempToken,
      };
    }

    await this.auditLogService.recordDomainEvent({
      statusCode: 200,
      outcome: 'success',
      eventType: 'auth.login.2fa_required',
      userId: user.id,
      userRole: user.role,
      message: 'Login accepted, pending 2FA verification',
      metadata: { email: user.email },
    });
    return {
      requires2FA: true,
      tempToken,
    };
  });

  changePassword = asyncHandler(
    async (tokenUserId: string, changePasswordDto: ChangePasswordDto) => {
      const { userId, password } = changePasswordDto;
      if (userId && userId !== tokenUserId) {
        throw new ForbiddenException(
          'Password change token does not match user',
        );
      }

      const user = await this.userService.findOneById(tokenUserId);

      await this.userService.updatePassword(user.id, password);
      await this.userService.clearMustChangePassword(user.id);
      await this.auditLogService.recordDomainEvent({
        statusCode: 200,
        outcome: 'success',
        eventType: 'auth.password.changed',
        userId: user.id,
        userRole: user.role,
        message: 'Password changed successfully',
      });

      return { message: 'Password changed successfully' };
    },
  );

  checkAuthStatus = asyncHandler(async (user: AuthUser) => {
    return {
      ...user,
      token: this.getJwtToken({
        sub: user.id,
        email: user.email,
        rol: user.role,
        is_two_factor_enabled: user.is_two_factor_enabled,
        is_two_factor_validated: user.is_two_factor_validated,
        client: user.client_id ?? null,
        mustChangePassword: user.mustChangePassword,
      }),
    };
  });

  beginDiscordLogin(link?: { userId: string }) {
    const secret = this.getJwtSecret();
    const state = createOAuthState();
    const verifier = createPkceVerifier();
    const cookieValue = serializeOAuthSession(
      {
        state,
        verifier,
        intent: link ? 'link' : 'login',
        userId: link?.userId,
      },
      secret,
    );

    return {
      url: this.discordAdapter.buildAuthorizeUrl(
        state,
        createPkceChallenge(verifier),
      ),
      cookieValue,
    };
  }

  beginDiscordLink(user: AuthUser) {
    if (
      !user.is_two_factor_validated ||
      user.mustChangePassword ||
      user.isRecovery
    ) {
      throw new ForbiddenException(
        'A fully authenticated session is required to link Discord',
      );
    }

    return this.beginDiscordLogin({ userId: user.id });
  }

  getDiscordStateCookieOptions() {
    return discordOAuthCookieOptions(
      this.configService.get<string>('app.nodeEnv') === 'production',
    );
  }

  buildDiscordFrontendRedirect(query: {
    code?: string;
    error?: string;
  }): string | null {
    const frontendUrl = this.configService.get<string>(
      'app.auth.discord.frontendUrl',
    );
    if (!frontendUrl) {
      return null;
    }

    let url: URL;
    try {
      const redirectPath =
        this.configService.get<string>(
          'app.auth.discord.frontendRedirectPath',
        ) ?? '/auth/discord';
      const base = frontendUrl.replace(/\/$/, '');
      const path = redirectPath.startsWith('/')
        ? redirectPath
        : `/${redirectPath}`;
      url = new URL(`${base}${path}`);
    } catch {
      return null;
    }

    if (!this.isAllowedFrontendOrigin(url.origin)) {
      return null;
    }

    if (query.code) {
      url.searchParams.set('code', query.code);
    }
    if (query.error) {
      url.searchParams.set('error', sanitizeDiscordError(query.error));
    }

    return url.toString();
  }

  async completeDiscordLogin(
    code: string | undefined,
    state: string | undefined,
    cookieValue: string | undefined,
  ) {
    const session = parseOAuthSession(cookieValue, this.getJwtSecret());
    if (!session || !oauthStatesMatch(session.state, state)) {
      throw new DiscordOAuthException('invalid_state');
    }

    if (!code) {
      throw new DiscordOAuthException('login_failed');
    }

    let profile: DiscordProfile;
    try {
      profile = await this.discordAdapter.authenticate(code, session.verifier);
    } catch (error) {
      if (error instanceof ServiceUnavailableException) {
        throw error;
      }
      throw new DiscordOAuthException('login_failed');
    }
    this.assertVerifiedDiscordEmail(profile);

    const user =
      session.intent === 'link' && session.userId
        ? await this.linkDiscordToUser(session.userId, profile)
        : await this.loginWithDiscord(profile);

    if (!user.isActive) {
      await this.auditLogService.recordDomainEvent({
        statusCode: 401,
        outcome: 'error',
        eventType: 'auth.login.discord.failed',
        userId: user.id,
        userRole: user.role,
        message: 'User is inactive',
        metadata: { discordId: profile.id },
      });
      throw new DiscordOAuthException('inactive');
    }

    return { code: this.issueDiscordTicket(user.id) };
  }

  async exchangeDiscordTicket(ticket: string) {
    let payload: DiscordLoginTicketPayload;
    try {
      payload = this.jwtService.verify<DiscordLoginTicketPayload>(ticket);
    } catch {
      throw new UnauthorizedException('Invalid or expired Discord login ticket');
    }

    if (payload.purpose !== 'discord_login' || !payload.sub) {
      throw new UnauthorizedException('Invalid or expired Discord login ticket');
    }

    const ticketId = payload.jti ?? ticket;
    this.consumeDiscordTicket(ticketId);

    const user = await this.userService.findOneById(payload.sub);
    return this.finalizeDiscordSession(user);
  }

  private getJwtToken(payload: JwtPayload) {
    return this.jwtService.sign(payload);
  }

  async verify2FA(userId: string, code: string) {
    const user = await this.userService.findOneById(userId);

    const valid =
      this.isMfaBypassEnabled() || (await this.twoFA.verifyCode(user.id, code));
    if (!valid) {
      await this.auditLogService.recordDomainEvent({
        statusCode: 401,
        outcome: 'error',
        eventType: 'auth.2fa.failed',
        userId: user.id,
        userRole: user.role,
        message: 'Invalid 2FA code',
      });
      throw new UnauthorizedException('Invalid 2FA code');
    }

    if (!user.is_two_factor_enabled) {
      await this.twoFA.enable(user.id);
      user.is_two_factor_enabled = true;
    }

    const token = this.generateToken(user);
    await this.auditLogService.recordDomainEvent({
      statusCode: 200,
      outcome: 'success',
      eventType: 'auth.2fa.verified',
      userId: user.id,
      userRole: user.role,
      message: '2FA verification completed',
      metadata: { codeLength: code?.length ?? 0 },
    });
    return token;
  }

  private generateToken(user: User) {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      is_two_factor_enabled: user.is_two_factor_enabled,
      is_two_factor_validated: true,
      rol: user.role,
      client: user.client?.id ?? null,
      mustChangePassword: user.mustChangePassword,
    };

    const { password: _password, ...userWithoutPassword } = user;
    return {
      access_token: this.jwtService.sign(payload),
      user: userWithoutPassword,
    };
  }

  private assertVerifiedDiscordEmail(profile: DiscordProfile) {
    if (!profile.email || profile.verified !== true) {
      throw new DiscordOAuthException(
        'unverified_email',
        'Discord account has no verified email',
      );
    }
  }

  private async loginWithDiscord(profile: DiscordProfile) {
    const email = profile.email!.toLowerCase().trim();
    const user = await this.userService.findOneByDiscordId(profile.id);

    if (user) {
      return user;
    }

    const existing = await this.userService.findOneByEmailOptional(email);
    if (existing) {
      await this.auditLogService.recordDomainEvent({
        statusCode: 401,
        outcome: 'error',
        eventType: 'auth.login.discord.failed',
        userId: existing.id,
        userRole: existing.role,
        message: 'Refused to auto-link Discord to an existing account',
        metadata: { discordId: profile.id },
      });
      throw new DiscordOAuthException('login_failed');
    }

    const names = namesFromDiscordProfile(profile);
    return this.userService.createFromDiscord({
      email,
      discordId: profile.id,
      first_name: names.first_name,
      last_name: names.last_name,
    });
  }

  private async linkDiscordToUser(userId: string, profile: DiscordProfile) {
    const user = await this.userService.findOneById(userId);

    if (user.discordId && user.discordId !== profile.id) {
      throw new DiscordOAuthException('link_failed');
    }

    try {
      await this.userService.linkDiscordAccount(user.id, profile.id);
    } catch (error) {
      if (error instanceof ConflictException) {
        throw new DiscordOAuthException('link_failed');
      }
      throw error;
    }

    user.discordId = profile.id;
    return user;
  }

  private async finalizeDiscordSession(user: User) {
    if (!user.role) {
      throw new UnauthorizedException('This user has no role');
    }

    if (!user.isActive) {
      throw new UnauthorizedException('User is inactive, talk with an admin');
    }

    const tempToken = this.jwtService.sign({
      sub: user.id,
      email: user.email,
      is_two_factor_enabled: user.is_two_factor_enabled,
      is_two_factor_validated: false,
      rol: user.role,
      client: user.client?.id ?? null,
      mustChangePassword: user.mustChangePassword,
    } satisfies JwtPayload);

    if (user.mustChangePassword) {
      await this.auditLogService.recordDomainEvent({
        statusCode: 200,
        outcome: 'warning',
        eventType: 'auth.login.password_change_required',
        userId: user.id,
        userRole: user.role,
        message: 'Discord login requires a password change',
      });
      return {
        requiresPasswordChange: true,
        userId: user.id,
        tempToken,
      };
    }

    const privileged =
      user.role === ValidRoles.admin || user.role === ValidRoles.client;
    const mustCompleteTwoFactor =
      privileged || Boolean(user.password) || user.is_two_factor_enabled;

    if (mustCompleteTwoFactor && !user.is_two_factor_enabled) {
      const data = await this.twoFA.generateSecretIfNotExists(user.id);
      await this.auditLogService.recordDomainEvent({
        statusCode: 200,
        outcome: 'warning',
        eventType: 'auth.login.2fa_setup_required',
        userId: user.id,
        userRole: user.role,
        message: 'Discord login requires 2FA setup',
      });
      return {
        requiresSetup: true,
        ...data,
        tempToken,
      };
    }

    if (mustCompleteTwoFactor) {
      await this.auditLogService.recordDomainEvent({
        statusCode: 200,
        outcome: 'success',
        eventType: 'auth.login.2fa_required',
        userId: user.id,
        userRole: user.role,
        message: 'Discord login accepted, pending 2FA verification',
      });
      return {
        requires2FA: true,
        tempToken,
      };
    }

    await this.auditLogService.recordDomainEvent({
      statusCode: 200,
      outcome: 'success',
      eventType: 'auth.login.discord.success',
      userId: user.id,
      userRole: user.role,
      message: 'Discord login completed',
      metadata: { discordId: user.discordId },
    });

    return this.generateToken(user);
  }

  private issueDiscordTicket(userId: string) {
    return this.jwtService.sign(
      {
        purpose: 'discord_login',
        sub: userId,
      } satisfies DiscordLoginTicketPayload,
      { expiresIn: '60s', jwtid: createOAuthState() },
    );
  }

  private consumeDiscordTicket(ticketId: string) {
    this.purgeConsumedDiscordTickets();
    if (this.consumedDiscordTickets.has(ticketId)) {
      throw new UnauthorizedException('Invalid or expired Discord login ticket');
    }
    this.consumedDiscordTickets.set(ticketId, Date.now() + 60_000);
  }

  private purgeConsumedDiscordTickets() {
    const now = Date.now();
    for (const [ticketId, expiresAt] of this.consumedDiscordTickets) {
      if (expiresAt <= now) {
        this.consumedDiscordTickets.delete(ticketId);
      }
    }
  }

  private getJwtSecret() {
    const secret = this.configService.get<string>('JWT_SECRET');
    if (!secret) {
      throw new ServiceUnavailableException('Discord login is not configured');
    }
    return secret;
  }

  private isAllowedFrontendOrigin(origin: string) {
    const nodeEnv = this.configService.get<string>('app.nodeEnv');
    const allowed =
      this.configService.get<string[]>('app.allowedOrigins') ?? [];

    if (nodeEnv !== 'production') {
      return true;
    }

    return allowed.includes('*') || allowed.includes(origin);
  }

  async verify2FAForRecovery(email: string, code: string) {
    const user = await this.userService.findOneByEmail(email);

    if (!user.is_two_factor_enabled) {
      throw new UnauthorizedException(
        '2FA is not enabled for this user. Please contact an admin.',
      );
    }

    const valid =
      this.isMfaBypassEnabled() || (await this.twoFA.verifyCode(user.id, code));
    if (!valid) {
      await this.auditLogService.recordDomainEvent({
        statusCode: 401,
        outcome: 'error',
        eventType: 'auth.recovery_2fa.failed',
        userId: user.id,
        userRole: user.role,
        message: 'Invalid 2FA recovery code',
        metadata: { email: user.email },
      });
      throw new UnauthorizedException('Invalid 2FA code');
    }

    const tempToken = this.jwtService.sign(
      {
        sub: user.id,
        email: user.email,
        rol: user.role,
        mustChangePassword: true,
        isRecovery: true,
      },
      { expiresIn: '10m' },
    );

    await this.auditLogService.recordDomainEvent({
      statusCode: 200,
      outcome: 'success',
      eventType: 'auth.recovery_2fa.verified',
      userId: user.id,
      userRole: user.role,
      message: 'Recovery 2FA verified',
      metadata: { email: user.email },
    });
    return {
      message: 'Code verified',
      tempToken,
      userId: user.id,
      requiresPasswordChange: true,
    };
  }

  private isMfaBypassEnabled(): boolean {
    return (
      this.configService.get<boolean>('app.auth.mfaBypassForTests') === true
    );
  }
}
