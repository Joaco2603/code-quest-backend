import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from '../services/auth.service.js';
import { UserService } from '../../user/user.service.js';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { BcryptAdapter } from '../adapters/bcrypt.adapter.js';
import { TwoFactorService } from '../services/two-factor.service.js';
import { AuditLogService } from '../../common/services/audit-log.service.js';
import { DiscordAdapter } from '../adapters/discord.adapter.js';
import { DiscordOAuthException } from '../errors/discord-oauth.exception.js';
import { serializeOAuthSession } from '../helpers/oauth-state.js';
import { UnauthorizedException } from '@nestjs/common';
import { User } from '../../user/entities/user.entity.js';
import { AuthUser } from '../interfaces/auth-user.type.js';
import { ValidRoles } from '../interfaces/index.js';
import { vi } from 'vitest';

describe('AuthService', () => {
  let service: AuthService;

  const mockUser: Partial<User> = {
    id: 'user-uuid-123',
    email: 'test@example.com',
    password: 'hashedPassword123',
    first_name: 'Test',
    last_name: 'User',
    isActive: true,
    is_two_factor_enabled: false,
    is_two_factor_pending: false,
    role: ValidRoles.user,
  };

  const mockUserService = {
    create: vi.fn(),
    findOneByEmail: vi.fn(),
    findOneById: vi.fn(),
    updatePassword: vi.fn(),
    clearMustChangePassword: vi.fn(),
    findOneByDiscordId: vi.fn(),
    findOneByEmailOptional: vi.fn(),
    createFromDiscord: vi.fn(),
    linkDiscordAccount: vi.fn(),
  };

  const mockJwtService = {
    sign: vi.fn(),
    verify: vi.fn(),
  };

  const mockTwoFactorService = {
    generateSecretIfNotExists: vi.fn(),
    verifyCode: vi.fn(),
    enable: vi.fn(),
    disable: vi.fn(),
  };

  const mockAuditLogService = {
    recordDomainEvent: vi.fn().mockResolvedValue(undefined),
    log: vi.fn().mockResolvedValue(undefined),
  };

  const mockConfigService = {
    get: vi.fn().mockReturnValue(false),
  };

  const mockDiscordAdapter = {
    createState: vi.fn(),
    buildAuthorizeUrl: vi.fn(),
    authenticate: vi.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: UserService,
          useValue: mockUserService,
        },
        {
          provide: JwtService,
          useValue: mockJwtService,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
        {
          provide: BcryptAdapter,
          useValue: new BcryptAdapter(),
        },
        {
          provide: TwoFactorService,
          useValue: mockTwoFactorService,
        },
        {
          provide: AuditLogService,
          useValue: mockAuditLogService,
        },
        {
          provide: DiscordAdapter,
          useValue: mockDiscordAdapter,
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);

    // Reset all mocks
    vi.clearAllMocks();
    mockConfigService.get.mockReset();
    mockConfigService.get.mockImplementation((key: string) => {
      if (key === 'JWT_SECRET') {
        return 'test-secret';
      }
      return false;
    });
    mockAuditLogService.recordDomainEvent.mockResolvedValue(undefined);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    const createUserDto = {
      email: 'test@example.com',
      password: 'Password123!',
      first_name: 'Test',
      last_name: 'User',
      address: '123 Test Street',
      role: 'user',
    };

    it('should create a new user and return with token', async () => {
      const token = 'jwt-token-123';
      const createdUser = { ...mockUser, password: undefined };

      mockUserService.create.mockResolvedValue(createdUser);
      mockJwtService.sign.mockReturnValue(token);

      const result = await service.create(createUserDto);

      expect(mockUserService.create).toHaveBeenCalled();
      expect(result).toEqual(expect.objectContaining({ token }));
    });

    it('should pass the password to UserService for hashing', async () => {
      mockUserService.create.mockResolvedValue(mockUser);
      mockJwtService.sign.mockReturnValue('token');

      await service.create(createUserDto);

      expect(mockUserService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          password: createUserDto.password,
        }),
      );
    });

    it('should set role as user for regular registration', async () => {
      mockUserService.create.mockResolvedValue(mockUser);
      mockJwtService.sign.mockReturnValue('token');

      await service.create(createUserDto);

      expect(mockUserService.create).toHaveBeenCalledWith(
        expect.objectContaining({ role: ValidRoles.user }),
      );
    });

    it('should throw UnauthorizedException if role not found', async () => {
      await expect(
        service.create({ ...createUserDto, role: 'superadmin' }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('createAdmin', () => {
    const createAdminDto = {
      email: 'admin@example.com',
      password: 'AdminPass123!',
      first_name: 'Admin',
      last_name: 'User',
      address: '456 Admin Street',
      role: 'superadmin',
    };

    it('should create an admin user with specified role', async () => {
      const token = 'admin-jwt-token';
      const createdAdmin = { ...mockUser, email: 'admin@example.com' };

      mockUserService.create.mockResolvedValue(createdAdmin);
      mockJwtService.sign.mockReturnValue(token);

      const result = await service.createAdmin(createAdminDto);

      expect(result.token).toBe(token);
    });

    it('should default to admin role if not specified', async () => {
      const dtoWithoutRole = {
        email: 'admin@example.com',
        password: 'AdminPass123!',
        first_name: 'Admin',
        last_name: 'User',
        address: '456 Admin Street',
      };

      mockUserService.create.mockResolvedValue(mockUser);
      mockJwtService.sign.mockReturnValue('token');

      await service.createAdmin(dtoWithoutRole);

      expect(mockUserService.create).toHaveBeenCalledWith(
        expect.objectContaining({ role: 'admin' }),
      );
    });

    it('should return token with created admin', async () => {
      mockUserService.create.mockResolvedValue(mockUser);
      mockJwtService.sign.mockReturnValue('admin-token');

      const result = await service.createAdmin(createAdminDto);

      expect(result.token).toBe('admin-token');
    });
  });

  describe('loginUser', () => {
    const loginUserDto = {
      email: 'test@example.com',
      password: 'Password123!',
    };

    it('should throw UnauthorizedException if user not found', async () => {
      mockUserService.findOneByEmailOptional.mockResolvedValue(null);

      await expect(service.loginUser(loginUserDto)).rejects.toThrow(
        UnauthorizedException,
      );
      await expect(service.loginUser(loginUserDto)).rejects.toThrow(
        'Invalid credentials',
      );
    });

    it('should throw UnauthorizedException if user is inactive', async () => {
      mockUserService.findOneByEmailOptional.mockResolvedValue({
        ...mockUser,
        isActive: false,
      });

      await expect(service.loginUser(loginUserDto)).rejects.toThrow(
        UnauthorizedException,
      );
      await expect(service.loginUser(loginUserDto)).rejects.toThrow(
        'Invalid credentials',
      );
    });

    it('should throw UnauthorizedException if password is invalid', async () => {
      const userWithDifferentPassword = {
        ...mockUser,
        password: '$2b$15$differentHashThatWontMatch',
      };
      mockUserService.findOneByEmailOptional.mockResolvedValue(
        userWithDifferentPassword,
      );

      await expect(service.loginUser(loginUserDto)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should return requiresSetup if 2FA is not enabled', async () => {
      // Create a proper bcrypt hash for the test password
      const bcrypt = new BcryptAdapter();
      const hashedPassword = await bcrypt.hashing('Password123!', 15);

      const userWithout2FA = {
        ...mockUser,
        password: hashedPassword,
        is_two_factor_enabled: false,
      };
      const twoFAData = {
        secret: 'secret123',
        otpauthUrl: 'otpauth://...',
        qr: 'data:image/png;base64,...',
        pending: true,
      };

      mockUserService.findOneByEmailOptional.mockResolvedValue(userWithout2FA);
      mockJwtService.sign.mockReturnValue('temp-token');
      mockTwoFactorService.generateSecretIfNotExists.mockResolvedValue(
        twoFAData,
      );

      const result = await service.loginUser(loginUserDto);

      expect((result as any).requiresSetup).toBe(true);
      expect((result as any).secret).toBe(twoFAData.secret);
      expect((result as any).tempToken).toBeDefined();
    });

    it('should return requires2FA if 2FA is already enabled', async () => {
      const bcrypt = new BcryptAdapter();
      const hashedPassword = await bcrypt.hashing('Password123!', 15);

      const userWith2FA = {
        ...mockUser,
        password: hashedPassword,
        is_two_factor_enabled: true,
      };

      mockUserService.findOneByEmailOptional.mockResolvedValue(userWith2FA);
      mockJwtService.sign.mockReturnValue('temp-token');

      const result = await service.loginUser(loginUserDto);

      expect(result.requires2FA).toBe(true);
      expect(result.tempToken).toBeDefined();
    });
  });

  describe('checkAuthStatus', () => {
    it('should return user with new token', async () => {
      const token = 'new-jwt-token';
      mockJwtService.sign.mockReturnValue(token);

      const result = await service.checkAuthStatus(mockUser as AuthUser);

      expect(result.token).toBe(token);
      expect(mockJwtService.sign).toHaveBeenCalledWith(
        expect.objectContaining({ sub: mockUser.id }),
      );
    });

    it('should generate token with user uuid', async () => {
      mockJwtService.sign.mockReturnValue('token');

      await service.checkAuthStatus(mockUser as AuthUser);

      expect(mockJwtService.sign).toHaveBeenCalledWith(
        expect.objectContaining({ sub: 'user-uuid-123' }),
      );
    });
  });

  describe('verify2FA', () => {
    const userId = 'user-uuid-123';
    const code = '123456';

    it('should throw UnauthorizedException if code is invalid', async () => {
      mockUserService.findOneById.mockResolvedValue(mockUser);
      mockTwoFactorService.verifyCode.mockResolvedValue(false);

      await expect(service.verify2FA(userId, code)).rejects.toThrow(
        UnauthorizedException,
      );
      await expect(service.verify2FA(userId, code)).rejects.toThrow(
        'Invalid 2FA code',
      );
    });

    it('should enable 2FA if not already enabled', async () => {
      const userWithout2FA = { ...mockUser, is_two_factor_enabled: false };

      mockUserService.findOneById.mockResolvedValue(userWithout2FA);
      mockTwoFactorService.verifyCode.mockResolvedValue(true);
      mockTwoFactorService.enable.mockResolvedValue({ message: '2FA enabled' });
      mockJwtService.sign.mockReturnValue('access-token');

      await service.verify2FA(userId, code);

      expect(mockTwoFactorService.enable).toHaveBeenCalledWith(userId);
    });

    it('should not enable 2FA if already enabled', async () => {
      const userWith2FA = { ...mockUser, is_two_factor_enabled: true };

      mockUserService.findOneById.mockResolvedValue(userWith2FA);
      mockTwoFactorService.verifyCode.mockResolvedValue(true);
      mockJwtService.sign.mockReturnValue('access-token');

      await service.verify2FA(userId, code);

      expect(mockTwoFactorService.enable).not.toHaveBeenCalled();
    });

    it('should return accessToken on successful verification', async () => {
      mockUserService.findOneById.mockResolvedValue(mockUser);
      mockTwoFactorService.verifyCode.mockResolvedValue(true);
      mockJwtService.sign.mockReturnValue('valid-access-token');

      const result = await service.verify2FA(userId, code);

      expect(result).toHaveProperty('accessToken');
      expect(result.accessToken).toBe('valid-access-token');
    });

    it('should generate token with correct payload', async () => {
      mockUserService.findOneById.mockResolvedValue(mockUser);
      mockTwoFactorService.verifyCode.mockResolvedValue(true);
      mockJwtService.sign.mockReturnValue('token');

      await service.verify2FA(userId, code);

      expect(mockJwtService.sign).toHaveBeenCalledWith(
        expect.objectContaining({
          sub: mockUser.id,
          email: mockUser.email,
          is_two_factor_validated: true,
        }),
      );
    });
  });

  describe('loginUser with Discord accounts', () => {
    const loginUserDto = {
      email: 'test@example.com',
      password: 'Password123!',
    };

    it('should reject password login when the account has no password', async () => {
      mockUserService.findOneByEmailOptional.mockResolvedValue({
        ...mockUser,
        password: null,
      });

      await expect(service.loginUser(loginUserDto)).rejects.toThrow(
        'Invalid credentials',
      );
    });
  });

  describe('completeDiscordLogin', () => {
    const profile = {
      id: 'discord-123',
      username: 'Student Dev',
      global_name: 'Student Dev',
      email: 'student@example.com',
      avatar: null,
      verified: true,
    };

    const discordUser = {
      ...mockUser,
      email: 'student@example.com',
      discordId: 'discord-123',
      password: null,
      mustChangePassword: false,
    };

    const loginCookie = serializeOAuthSession(
      {
        state: 'state',
        verifier: 'verifier',
        intent: 'login',
      },
      'test-secret',
    );

    it('should reject mismatched OAuth state', async () => {
      await expect(
        service.completeDiscordLogin('code', 'state-a', loginCookie),
      ).rejects.toThrow(DiscordOAuthException);
    });

    it('should reject a missing authorization code', async () => {
      await expect(
        service.completeDiscordLogin(undefined, 'state', loginCookie),
      ).rejects.toThrow(DiscordOAuthException);
    });

    it('should reject unverified Discord emails', async () => {
      mockDiscordAdapter.authenticate.mockResolvedValue({
        ...profile,
        verified: false,
      });

      await expect(
        service.completeDiscordLogin('code', 'state', loginCookie),
      ).rejects.toMatchObject({ errorCode: 'unverified_email' });
    });

    it('should issue a one-time ticket for an existing Discord user', async () => {
      mockDiscordAdapter.authenticate.mockResolvedValue(profile);
      mockUserService.findOneByDiscordId.mockResolvedValue(discordUser);
      mockJwtService.sign.mockReturnValue('discord-ticket');

      const result = await service.completeDiscordLogin(
        'code',
        'state',
        loginCookie,
      );

      expect(mockDiscordAdapter.authenticate).toHaveBeenCalledWith(
        'code',
        'verifier',
      );
      expect(mockUserService.createFromDiscord).not.toHaveBeenCalled();
      expect(mockUserService.linkDiscordAccount).not.toHaveBeenCalled();
      expect(result).toEqual({ code: 'discord-ticket' });
      expect(mockJwtService.sign).toHaveBeenCalledWith(
        expect.objectContaining({
          purpose: 'discord_login',
          sub: discordUser.id,
        }),
        expect.objectContaining({ expiresIn: '60s' }),
      );
    });

    it('should not auto-link Discord to an existing email account', async () => {
      mockDiscordAdapter.authenticate.mockResolvedValue(profile);
      mockUserService.findOneByDiscordId.mockResolvedValue(null);
      mockUserService.findOneByEmailOptional.mockResolvedValue({
        ...mockUser,
        discordId: null,
        role: ValidRoles.admin,
      });

      await expect(
        service.completeDiscordLogin('code', 'state', loginCookie),
      ).rejects.toMatchObject({ errorCode: 'login_failed' });
      expect(mockUserService.linkDiscordAccount).not.toHaveBeenCalled();
    });

    it('should create a user when Discord is new', async () => {
      mockDiscordAdapter.authenticate.mockResolvedValue(profile);
      mockUserService.findOneByDiscordId.mockResolvedValue(null);
      mockUserService.findOneByEmailOptional.mockResolvedValue(null);
      mockUserService.createFromDiscord.mockResolvedValue(discordUser);
      mockJwtService.sign.mockReturnValue('created-ticket');

      const result = await service.completeDiscordLogin(
        'code',
        'state',
        loginCookie,
      );

      expect(mockUserService.createFromDiscord).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'student@example.com',
          discordId: 'discord-123',
          first_name: 'student',
          last_name: 'dev',
        }),
      );
      expect(result).toEqual({ code: 'created-ticket' });
    });

    it('should reject inactive Discord users', async () => {
      mockDiscordAdapter.authenticate.mockResolvedValue(profile);
      mockUserService.findOneByDiscordId.mockResolvedValue({
        ...discordUser,
        isActive: false,
      });

      await expect(
        service.completeDiscordLogin('code', 'state', loginCookie),
      ).rejects.toMatchObject({ errorCode: 'inactive' });
    });

    it('should link Discord only for an authenticated link intent', async () => {
      const linkCookie = serializeOAuthSession(
        {
          state: 'state',
          verifier: 'verifier',
          intent: 'link',
          userId: mockUser.id,
        },
        'test-secret',
      );
      mockDiscordAdapter.authenticate.mockResolvedValue(profile);
      mockUserService.findOneById.mockResolvedValue({
        ...mockUser,
        discordId: null,
      });
      mockJwtService.sign.mockReturnValue('link-ticket');

      const result = await service.completeDiscordLogin(
        'code',
        'state',
        linkCookie,
      );

      expect(mockUserService.linkDiscordAccount).toHaveBeenCalledWith(
        mockUser.id,
        profile.id,
      );
      expect(result).toEqual({ code: 'link-ticket' });
    });
  });

  describe('exchangeDiscordTicket', () => {
    const discordUser = {
      ...mockUser,
      email: 'student@example.com',
      discordId: 'discord-123',
      password: null,
      mustChangePassword: false,
    };

    it('should issue a full token for Discord-only student accounts', async () => {
      mockJwtService.verify.mockReturnValue({
        purpose: 'discord_login',
        sub: discordUser.id,
        jti: 'ticket-1',
      });
      mockUserService.findOneById.mockResolvedValue(discordUser);
      mockJwtService.sign.mockReturnValue('access-token');

      const result = await service.exchangeDiscordTicket('ticket');

      expect(result).toEqual(
        expect.objectContaining({ accessToken: 'access-token' }),
      );
    });

    it('should reject a reused ticket', async () => {
      mockJwtService.verify.mockReturnValue({
        purpose: 'discord_login',
        sub: discordUser.id,
        jti: 'ticket-reuse',
      });
      mockUserService.findOneById.mockResolvedValue(discordUser);
      mockJwtService.sign.mockReturnValue('access-token');

      await service.exchangeDiscordTicket('ticket');

      await expect(service.exchangeDiscordTicket('ticket')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should require 2FA when the Discord-linked account already has it', async () => {
      mockJwtService.verify.mockReturnValue({
        purpose: 'discord_login',
        sub: mockUser.id,
        jti: 'ticket-2fa',
      });
      mockUserService.findOneById.mockResolvedValue({
        ...mockUser,
        password: 'hashed',
        is_two_factor_enabled: true,
        mustChangePassword: false,
      });
      mockJwtService.sign.mockReturnValue('temp-token');

      const result = await service.exchangeDiscordTicket('ticket');

      expect(result).toEqual(
        expect.objectContaining({
          requires2FA: true,
          tempToken: 'temp-token',
        }),
      );
    });

    it('should require a password change when the flag is set', async () => {
      mockJwtService.verify.mockReturnValue({
        purpose: 'discord_login',
        sub: mockUser.id,
        jti: 'ticket-password',
      });
      mockUserService.findOneById.mockResolvedValue({
        ...mockUser,
        password: 'hashed',
        mustChangePassword: true,
      });
      mockJwtService.sign.mockReturnValue('temp-token');

      const result = await service.exchangeDiscordTicket('ticket');

      expect(result).toEqual(
        expect.objectContaining({
          requiresPasswordChange: true,
          tempToken: 'temp-token',
        }),
      );
    });
  });

  describe('buildDiscordFrontendRedirect', () => {
    it('should build the frontend redirect with a one-time code', () => {
      mockConfigService.get.mockImplementation((key: string) => {
        if (key === 'JWT_SECRET') {
          return 'test-secret';
        }
        if (key === 'app.auth.discord.frontendUrl') {
          return 'http://localhost:8080';
        }
        if (key === 'app.auth.discord.frontendRedirectPath') {
          return '/auth/discord';
        }
        return false;
      });

      expect(service.buildDiscordFrontendRedirect({ code: 'ticket' })).toBe(
        'http://localhost:8080/auth/discord?code=ticket',
      );
    });

    it('should only allow known error codes in the redirect', () => {
      mockConfigService.get.mockImplementation((key: string) => {
        if (key === 'app.auth.discord.frontendUrl') {
          return 'http://localhost:8080';
        }
        if (key === 'app.auth.discord.frontendRedirectPath') {
          return '/auth/discord';
        }
        return false;
      });

      expect(
        service.buildDiscordFrontendRedirect({
          error: 'User with email admin@example.com already exists',
        }),
      ).toBe('http://localhost:8080/auth/discord?error=login_failed');
    });
  });
});