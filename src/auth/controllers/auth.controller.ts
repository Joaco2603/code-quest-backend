import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { AuthService } from '../services/auth.service';
import {
  CreateUserDto,
  LoginUserDto,
  Verify2FADto,
  ChangePasswordDto,
} from '../dtos/index.js';
import { AuthGuard } from '@nestjs/passport';
import { GetUser } from '../decorators/get-user.decorators';
import { User } from 'src/user/entities/user.entity';
import { JwtAuthGuard } from '../guards/jwt.guard';
import { ValidRoles } from '../interfaces/index.js';
import { Auth } from '../decorators';
import { RateLimit } from 'src/common/decorators/rate-limit.decorator';
import { PendingTwoFactorGuard } from '../guards/pending-two-factor.guard';
import { ChangePasswordGuard } from '../guards/change-password.guard.js';
import {
  ApiBearerAuth,
  ApiBadRequestResponse,
  ApiBody,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
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
  create(@GetUser() user: User, @Body() createUserDto: CreateUserDto) {
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
  checkAuthStatus(@GetUser() user: User) {
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
  async verify(@Req() req, @Body() dto: Verify2FADto) {
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
  changePassword(@Req() req, @Body() changePasswordDto: ChangePasswordDto) {
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
}