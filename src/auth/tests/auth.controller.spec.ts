import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from '../controllers/auth.controller.js';
import { AuthService } from '../services/auth.service.js';
import { AuthUser } from '../interfaces/auth-user.type.js';
import { CreateUserDto, LoginUserDto, Verify2FADto } from '../dtos/index.js';
import type { VerifiedSessionResponseDto } from '../dtos/index.js';
import { UnauthorizedException } from '@nestjs/common';
import { ValidRoles } from '../interfaces/index.js';
import { PassportModule } from '@nestjs/passport';
import { User } from '../../user/entities/user.entity.js';
import { vi, type Mocked } from 'vitest';

function buildUserEntity(overrides: Partial<User> = {}): User {
  const user = new User();
  user.id = '43566ec8-22af-41d3-933a-918b536fe99f';
  user.email = 'operator@example.com';
  user.discordId = null;
  user.first_name = 'operator';
  user.last_name = 'quest';
  user.address = 'Code Quest main campus';
  user.isActive = true;
  user.role = ValidRoles.user;
  user.client = null;
  user.is_two_factor_enabled = true;
  user.is_two_factor_pending = false;
  user.mustChangePassword = false;
  return Object.assign(user, overrides);
}

describe('AuthController', () => {
  let controller: AuthController;
  let authService: Mocked<AuthService>;

  const mockUser: AuthUser = {
    id: 'user-uuid-123',
    email: 'test@example.com',
    is_two_factor_enabled: false,
    is_two_factor_validated: true,
    role: ValidRoles.admin,
  };

  const mockAuthService = {
    create: vi.fn(),
    loginUser: vi.fn(),
    checkAuthStatus: vi.fn(),
    verify2FA: vi.fn(),
    verify2FAForRecovery: vi.fn(),
    changePassword: vi.fn(),
    beginDiscordLogin: vi.fn(),
    beginDiscordLink: vi.fn(),
    completeDiscordLogin: vi.fn(),
    exchangeDiscordTicket: vi.fn(),
    buildDiscordFrontendRedirect: vi.fn(),
    getDiscordStateCookieOptions: vi.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [PassportModule.register({ defaultStrategy: 'jwt' })],
      controllers: [AuthController],
      providers: [
        {
          provide: AuthService,
          useValue: mockAuthService,
        },
      ],
    }).compile();

    controller = module.get<AuthController>(AuthController);
    authService = module.get(AuthService);

    // Reset all mocks
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('create (POST /auth/register)', () => {
    const createUserDto: CreateUserDto = {
      email: 'newuser@example.com',
      password: 'Password123!',
      first_name: 'New',
      last_name: 'User',
      address: '123 Test Street',
    };

    it('should create a new user wrapped in a password-change challenge', async () => {
      mockAuthService.create.mockResolvedValue({
        requiresPasswordChange: true,
        userId: '43566ec8-22af-41d3-933a-918b536fe99f',
        tempToken: 'temp-jwt-token',
      });

      const result = await controller.create(mockUser, createUserDto);

      expect(authService.create).toHaveBeenCalledWith(createUserDto);
      expect(Object.keys(result)).toEqual(['data']);
      expect(result).not.toHaveProperty('data.data');
      expect(result.data).toEqual({
        requiresPasswordChange: true,
        userId: '43566ec8-22af-41d3-933a-918b536fe99f',
        tempToken: 'temp-jwt-token',
      });
      expect(JSON.stringify(result)).not.toContain('password');
      expect(JSON.stringify(result)).not.toContain('two_factor_secret');
    });

    it('should force role user with the client owner for client actors', async () => {
      const clientActor: AuthUser = { ...mockUser, role: ValidRoles.client };
      mockAuthService.create.mockResolvedValue({
        requiresPasswordChange: true,
        userId: clientActor.id,
        tempToken: 'temp-jwt-token',
      });

      await controller.create(clientActor, createUserDto);

      expect(authService.create).toHaveBeenCalledWith(
        expect.objectContaining({ role: 'user', client_id: clientActor.id }),
      );
    });

    it('should wrap the register/user shortcut the same way', async () => {
      mockAuthService.create.mockResolvedValue({
        requiresPasswordChange: true,
        userId: '43566ec8-22af-41d3-933a-918b536fe99f',
        tempToken: 'temp-jwt-token',
      });

      const result = await controller.createUser(createUserDto);

      expect(authService.create).toHaveBeenCalledWith(
        expect.objectContaining({ role: 'user' }),
      );
      expect(Object.keys(result)).toEqual(['data']);
      expect(result.data).toEqual({
        requiresPasswordChange: true,
        userId: '43566ec8-22af-41d3-933a-918b536fe99f',
        tempToken: 'temp-jwt-token',
      });
    });
  });

  describe('loginUser (POST /auth/login)', () => {
    const loginUserDto: LoginUserDto = {
      email: 'test@example.com',
      password: 'Password123!',
    };

    it('should wrap the requires2FA variant without provisioning material', async () => {
      mockAuthService.loginUser.mockResolvedValue({
        requires2FA: true,
        tempToken: 'temp-jwt-token',
      });

      const result = await controller.loginUser(loginUserDto);

      expect(authService.loginUser).toHaveBeenCalledWith(loginUserDto);
      expect(Object.keys(result)).toEqual(['data']);
      expect(result.data).toEqual({
        requires2FA: true,
        tempToken: 'temp-jwt-token',
      });
      expect(result.data).not.toHaveProperty('secret');
      expect(result.data).not.toHaveProperty('otpauthUrl');
      expect(result.data).not.toHaveProperty('qr');
    });

    it('should wrap the requiresSetup variant with provisioning material', async () => {
      mockAuthService.loginUser.mockResolvedValue({
        requiresSetup: true,
        secret: 'secret123',
        otpauthUrl: 'otpauth://...',
        qr: 'data:image/png;base64,...',
        pending: true,
        tempToken: 'temp-jwt-token',
      });

      const result = await controller.loginUser(loginUserDto);

      expect(result.data).toMatchObject({
        requiresSetup: true,
        secret: 'secret123',
        tempToken: 'temp-jwt-token',
      });
    });

    it('should wrap the requiresPasswordChange variant', async () => {
      mockAuthService.loginUser.mockResolvedValue({
        requiresPasswordChange: true,
        userId: 'user-uuid-123',
        tempToken: 'temp-jwt-token',
      });

      const result = await controller.loginUser(loginUserDto);

      expect(result.data).toEqual({
        requiresPasswordChange: true,
        userId: 'user-uuid-123',
        tempToken: 'temp-jwt-token',
      });
      expect(result.data).not.toHaveProperty('secret');
    });

    it('should throw UnauthorizedException for invalid credentials', async () => {
      mockAuthService.loginUser.mockRejectedValue(
        new UnauthorizedException('Credentials are not valid'),
      );

      await expect(controller.loginUser(loginUserDto)).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('checkAuthStatus (GET /auth/renovated)', () => {
    it('should return the camelCase session wrapped in data', async () => {
      mockAuthService.checkAuthStatus.mockResolvedValue({
        user: {
          ...mockUser,
          client_id: 'client-1',
          mustChangePassword: false,
        },
        token: 'new-jwt-token',
      });

      const result = await controller.checkAuthStatus(mockUser);

      expect(authService.checkAuthStatus).toHaveBeenCalledWith(mockUser);
      expect(Object.keys(result)).toEqual(['data']);
      expect(result.data).toEqual({
        user: {
          id: 'user-uuid-123',
          email: 'test@example.com',
          role: ValidRoles.admin,
          isTwoFactorEnabled: false,
          isTwoFactorValidated: true,
          clientId: 'client-1',
          mustChangePassword: false,
        },
        token: 'new-jwt-token',
      });
    });

    it('should map absent session fields to null', async () => {
      mockAuthService.checkAuthStatus.mockResolvedValue({
        user: mockUser,
        token: 'new-jwt-token',
      });

      const result = await controller.checkAuthStatus(mockUser);

      expect(result.data.user.clientId).toBeNull();
      expect(result.data.user.mustChangePassword).toBeNull();
    });
  });

  describe('verify (POST /auth/2fa/verify)', () => {
    const verify2FADto: Verify2FADto = {
      code: '123456',
    };

    const mockRequest = {
      user: mockUser,
    };

    it('should verify 2FA code and return the serialized session in data', async () => {
      mockAuthService.verify2FA.mockResolvedValue({
        accessToken: 'valid-access-token',
        user: buildUserEntity({
          password: 'hash-must-not-leak',
          two_factor_secret: 'totp-must-not-leak',
        } as Partial<User>),
      });

      const result = await controller.verify(mockRequest, verify2FADto);

      expect(authService.verify2FA).toHaveBeenCalledWith(
        mockRequest.user.id,
        verify2FADto.code,
      );
      expect(Object.keys(result)).toEqual(['data']);
      expect(result.data.accessToken).toBe('valid-access-token');
      expect(result.data.user).toMatchObject({
        id: '43566ec8-22af-41d3-933a-918b536fe99f',
        firstName: 'operator',
      });
      expect(result.data).not.toHaveProperty('access_token');
      expect(JSON.stringify(result)).not.toContain('hash-must-not-leak');
      expect(JSON.stringify(result)).not.toContain('totp-must-not-leak');
    });

    it('should throw UnauthorizedException for invalid 2FA code', async () => {
      mockAuthService.verify2FA.mockRejectedValue(
        new UnauthorizedException('Invalid 2FA code'),
      );

      await expect(
        controller.verify(mockRequest, { code: 'invalid' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should use user id from request', async () => {
      mockAuthService.verify2FA.mockResolvedValue({
        accessToken: 'token',
        user: buildUserEntity(),
      });

      await controller.verify(mockRequest, verify2FADto);

      expect(authService.verify2FA).toHaveBeenCalledWith(
        'user-uuid-123',
        '123456',
      );
    });
  });

  describe('changePassword (POST /auth/change-password)', () => {
    it('should wrap the confirmation message in data', async () => {
      mockAuthService.changePassword.mockResolvedValue({
        message: 'Password changed successfully',
      });

      const result = await controller.changePassword(
        { user: mockUser },
        { userId: 'user-uuid-123', password: 'NewPassword1!' },
      );

      expect(result).toEqual({
        data: { message: 'Password changed successfully' },
      });
    });
  });

  describe('forgotPassword2FA (POST /auth/forgot-password-2fa)', () => {
    it('should wrap the recovery challenge with its temp token', async () => {
      mockAuthService.verify2FAForRecovery.mockResolvedValue({
        message: 'Code verified',
        tempToken: 'recovery-token',
        userId: 'user-uuid-123',
        requiresPasswordChange: true,
      });

      const result = await controller.forgotPassword2FA({
        email: 'test@example.com',
        code: '123456',
      });

      expect(result).toEqual({
        data: {
          message: 'Code verified',
          tempToken: 'recovery-token',
          userId: 'user-uuid-123',
          requiresPasswordChange: true,
        },
      });
    });
  });

  describe('discordLogin (GET /auth/discord)', () => {
    it('should set the signed OAuth cookie and redirect to Discord', () => {
      mockAuthService.beginDiscordLogin.mockReturnValue({
        url: 'https://discord.com/oauth2/authorize?client_id=abc',
        cookieValue: 'signed-oauth-session',
      });
      mockAuthService.getDiscordStateCookieOptions.mockReturnValue({
        httpOnly: true,
        path: '/api/auth',
      });
      const res = {
        cookie: vi.fn(),
        redirect: vi.fn(),
      };

      controller.discordLogin(res as never);

      expect(res.cookie).toHaveBeenCalledWith(
        'discord_oauth_state',
        'signed-oauth-session',
        expect.objectContaining({ httpOnly: true }),
      );
      expect(res.redirect).toHaveBeenCalledWith(
        'https://discord.com/oauth2/authorize?client_id=abc',
      );
    });
  });

  describe('linkDiscord (POST /auth/discord/link)', () => {
    it('should wrap the authorization url in data and keep the cookie', () => {
      mockAuthService.beginDiscordLink.mockReturnValue({
        url: 'https://discord.com/oauth2/authorize?client_id=abc',
        cookieValue: 'signed-oauth-session',
      });
      mockAuthService.getDiscordStateCookieOptions.mockReturnValue({
        httpOnly: true,
        path: '/api/auth',
      });
      const res = {
        cookie: vi.fn(),
        json: vi.fn(),
      };

      controller.linkDiscord(mockUser, res as never);

      expect(res.cookie).toHaveBeenCalledWith(
        'discord_oauth_state',
        'signed-oauth-session',
        expect.objectContaining({ httpOnly: true }),
      );
      expect(res.json).toHaveBeenCalledWith({
        data: { url: 'https://discord.com/oauth2/authorize?client_id=abc' },
      });
    });
  });

  describe('discordCallback (GET /auth/discord/callback)', () => {
    const req = {
      headers: { cookie: 'discord_oauth_state=signed-oauth-session' },
    };

    it('should complete Discord login and redirect with a one-time code', async () => {
      mockAuthService.completeDiscordLogin.mockResolvedValue({
        code: 'discord-ticket',
      });
      mockAuthService.buildDiscordFrontendRedirect.mockReturnValue(
        'http://localhost:8080/auth/discord?code=discord-ticket',
      );
      const res = {
        json: vi.fn(),
        redirect: vi.fn(),
        clearCookie: vi.fn(),
      };

      await controller.discordCallback(
        'code',
        'oauth-state',
        undefined,
        undefined,
        req as never,
        res as never,
      );

      expect(authService.completeDiscordLogin).toHaveBeenCalledWith(
        'code',
        'oauth-state',
        'signed-oauth-session',
      );
      expect(res.redirect).toHaveBeenCalledWith(
        'http://localhost:8080/auth/discord?code=discord-ticket',
      );
    });

    it('should return the ticket wrapped in data when format=json', async () => {
      mockAuthService.completeDiscordLogin.mockResolvedValue({
        code: 'discord-ticket',
      });
      const res = {
        json: vi.fn(),
        redirect: vi.fn(),
        clearCookie: vi.fn(),
      };

      await controller.discordCallback(
        'code',
        'oauth-state',
        undefined,
        'json',
        req as never,
        res as never,
      );

      expect(res.json).toHaveBeenCalledWith({
        data: { code: 'discord-ticket' },
      });
      expect(res.redirect).not.toHaveBeenCalled();
    });

    it('should redirect Discord denials with a sanitized error code', async () => {
      mockAuthService.buildDiscordFrontendRedirect.mockReturnValue(
        'http://localhost:8080/auth/discord?error=access_denied',
      );
      const res = {
        json: vi.fn(),
        redirect: vi.fn(),
        clearCookie: vi.fn(),
      };

      await controller.discordCallback(
        undefined,
        undefined,
        'access_denied',
        undefined,
        req as never,
        res as never,
      );

      expect(authService.completeDiscordLogin).not.toHaveBeenCalled();
      expect(authService.buildDiscordFrontendRedirect).toHaveBeenCalledWith({
        error: 'access_denied',
      });
      expect(res.redirect).toHaveBeenCalledWith(
        'http://localhost:8080/auth/discord?error=access_denied',
      );
    });
  });

  describe('exchangeDiscord (POST /auth/discord/exchange)', () => {
    it('should wrap the full session with the serialized user', async () => {
      mockAuthService.exchangeDiscordTicket.mockResolvedValue({
        accessToken: 'access-token',
        user: buildUserEntity({
          password: 'hash-must-not-leak',
          two_factor_secret: 'totp-must-not-leak',
        } as Partial<User>),
      });

      const result = await controller.exchangeDiscord({ code: 'ticket' });

      expect(authService.exchangeDiscordTicket).toHaveBeenCalledWith('ticket');
      expect(Object.keys(result)).toEqual(['data']);
      const session = result.data as VerifiedSessionResponseDto;
      expect(session.accessToken).toBe('access-token');
      expect(session.user).toMatchObject({
        id: '43566ec8-22af-41d3-933a-918b536fe99f',
        firstName: 'operator',
      });
      expect(JSON.stringify(result)).not.toContain('hash-must-not-leak');
    });

    it('should wrap challenge variants without provisioning material', async () => {
      mockAuthService.exchangeDiscordTicket.mockResolvedValue({
        requires2FA: true,
        tempToken: 'temp-token',
      });

      const result = await controller.exchangeDiscord({ code: 'ticket' });

      expect(result).toEqual({
        data: { requires2FA: true, tempToken: 'temp-token' },
      });
      expect(result.data).not.toHaveProperty('secret');
    });

    it('should wrap the setup variant with provisioning material', async () => {
      mockAuthService.exchangeDiscordTicket.mockResolvedValue({
        requiresSetup: true,
        secret: 'secret123',
        otpauthUrl: 'otpauth://...',
        qr: 'data:image/png;base64,...',
        pending: true,
        tempToken: 'temp-token',
      });

      const result = await controller.exchangeDiscord({ code: 'ticket' });

      expect(result.data).toMatchObject({
        requiresSetup: true,
        secret: 'secret123',
      });
    });

    it('should wrap the password-change variant', async () => {
      mockAuthService.exchangeDiscordTicket.mockResolvedValue({
        requiresPasswordChange: true,
        userId: 'user-uuid-123',
        tempToken: 'temp-token',
      });

      const result = await controller.exchangeDiscord({ code: 'ticket' });

      expect(result).toEqual({
        data: {
          requiresPasswordChange: true,
          userId: 'user-uuid-123',
          tempToken: 'temp-token',
        },
      });
    });
  });
});
