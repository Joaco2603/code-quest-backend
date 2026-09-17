import {
  ForbiddenException,
  forwardRef,
  Inject,
  Injectable,
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
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UserService } from '../../user/user.service.js';
import { User } from '../../user/entities/user.entity.js';
import { asyncHandler } from '../../common/helpers/async-handler.js';
import { TwoFactorService } from './two-factor.service.js';
import { AuditLogService } from '../../common/services/audit-log.service.js';
import { ValidRoles } from '../interfaces/valid-roles.type.js';

@Injectable()
export class AuthService {
  constructor(
    @Inject(forwardRef(() => UserService))
    private readonly userService: UserService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly bcryptAdapter: BcryptAdapter,
    private readonly twoFA: TwoFactorService,
    private readonly auditLogService: AuditLogService,
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
