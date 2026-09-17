import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from '../controllers/auth.controller.js';
import { AuthService } from '../services/auth.service.js';
import { AuthUser } from '../interfaces/auth-user.type.js';
import { CreateUserDto, LoginUserDto, Verify2FADto } from '../dtos/index.js';
import { UnauthorizedException } from '@nestjs/common';
import { ValidRoles } from '../interfaces/index.js';
import { PassportModule } from '@nestjs/passport';
import { vi, type Mocked } from 'vitest';

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

    it('should create a new user', async () => {
      const expectedResult = {
        ...mockUser,
        token: 'jwt-token-123',
      };

      mockAuthService.create.mockResolvedValue(expectedResult);

      const result = await controller.create(mockUser, createUserDto);

      expect(authService.create).toHaveBeenCalledWith(createUserDto);
      expect(result).toEqual(expectedResult);
    });

    it('should call authService.create with correct dto', async () => {
      mockAuthService.create.mockResolvedValue(mockUser);

      await controller.create(mockUser, createUserDto);

      expect(authService.create).toHaveBeenCalledTimes(1);
      expect(authService.create).toHaveBeenCalledWith(createUserDto);
    });
  });

  describe('loginUser (POST /auth/login)', () => {
    const loginUserDto: LoginUserDto = {
      email: 'test@example.com',
      password: 'Password123!',
    };

    it('should login user and return requires2FA when 2FA is enabled', async () => {
      const expectedResult = {
        requires2FA: true,
        tempToken: 'temp-jwt-token',
      };

      mockAuthService.loginUser.mockResolvedValue(expectedResult);

      const result = await controller.loginUser(loginUserDto);

      expect(authService.loginUser).toHaveBeenCalledWith(loginUserDto);
      expect(result).toEqual(expectedResult);
    });

    it('should login user and return requiresSetup when 2FA is not set', async () => {
      const expectedResult = {
        requiresSetup: true,
        secret: 'secret123',
        otpauthUrl: 'otpauth://...',
        qr: 'data:image/png;base64,...',
        tempToken: 'temp-jwt-token',
      };

      mockAuthService.loginUser.mockResolvedValue(expectedResult);

      const result = await controller.loginUser(loginUserDto);

      expect((result as any).requiresSetup).toBe(true);
      expect((result as any).secret).toBeDefined();
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
    it('should return user with new token', async () => {
      const expectedResult = {
        ...mockUser,
        token: 'new-jwt-token',
      };

      mockAuthService.checkAuthStatus.mockResolvedValue(expectedResult);

      const result = await controller.checkAuthStatus(mockUser);

      expect(authService.checkAuthStatus).toHaveBeenCalledWith(mockUser);
      expect(result).toEqual(expectedResult);
    });

    it('should call checkAuthStatus with the user from decorator', async () => {
      mockAuthService.checkAuthStatus.mockResolvedValue(mockUser);

      await controller.checkAuthStatus(mockUser);

      expect(authService.checkAuthStatus).toHaveBeenCalledTimes(1);
      expect(authService.checkAuthStatus).toHaveBeenCalledWith(mockUser);
    });
  });

  describe('verify (POST /auth/2fa/verify)', () => {
    const verify2FADto: Verify2FADto = {
      code: '123456',
    };

    const mockRequest = {
      user: mockUser,
    };

    it('should verify 2FA code and return access token', async () => {
      const expectedResult = {
        access_token: 'valid-access-token',
      };

      mockAuthService.verify2FA.mockResolvedValue(expectedResult);

      const result = await controller.verify(mockRequest, verify2FADto);

      expect(authService.verify2FA).toHaveBeenCalledWith(
        mockRequest.user.id,
        verify2FADto.code,
      );
      expect(result).toEqual(expectedResult);
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
      mockAuthService.verify2FA.mockResolvedValue({ access_token: 'token' });

      await controller.verify(mockRequest, verify2FADto);

      expect(authService.verify2FA).toHaveBeenCalledWith(
        'user-uuid-123',
        '123456',
      );
    });
  });
});