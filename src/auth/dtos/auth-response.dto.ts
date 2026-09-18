import { ApiProperty } from '@nestjs/swagger';
import { ValidRoles } from '../interfaces/valid-roles.type.js';
import { UserDetailResponseDto } from '../../user/dtos/user-response.dto.js';

/**
 * Public output contracts for authentication, 2FA and Discord flows.
 *
 * Every class below describes the exact JSON sent over HTTP. Services return
 * raw results and controllers wrap them once with `toDataResponse`, so each
 * contract has an inner payload plus a `{ data }` envelope variant for
 * Swagger. Provisioning material (`secret` / `otpauthUrl` / `qr`) only
 * exists on the setup payloads; no other variant carries it.
 */
export class AuthRegisterResponseDto {
  @ApiProperty({
    description: 'Created user, serialized with the Etapa 2 user contract.',
    type: () => UserDetailResponseDto,
  })
  user: UserDetailResponseDto;

  @ApiProperty({
    description: 'Access token issued for the new account.',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
  })
  token: string;
}

export class AuthRegisterDataResponseDto {
  @ApiProperty({ type: () => AuthRegisterResponseDto })
  data: AuthRegisterResponseDto;
}

export class LoginPasswordChangeResponseDto {
  @ApiProperty({
    description: 'Signals the client must force a password change first.',
    example: true,
  })
  requiresPasswordChange: boolean;

  @ApiProperty({
    description: 'User id that owns the pending password change.',
    example: '43566ec8-22af-41d3-933a-918b536fe99f',
  })
  userId: string;

  @ApiProperty({
    description: 'Short-lived token scoped to the password-change flow.',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
  })
  tempToken: string;
}

export class LoginPasswordChangeDataResponseDto {
  @ApiProperty({ type: () => LoginPasswordChangeResponseDto })
  data: LoginPasswordChangeResponseDto;
}

export class TwoFactorProvisioningDto {
  @ApiProperty({
    description:
      'TOTP secret for first-time enrollment. Only present on setup payloads.',
    example: 'JBSWY3DPEHPK3PXP',
  })
  secret: string;

  @ApiProperty({
    description: 'Authenticator enrollment URL for the pending secret.',
    example: 'otpauth://totp/CodeQuest:operator@example.com?secret=JBSWY3DPEHPK3PXP',
  })
  otpauthUrl: string;

  @ApiProperty({
    description: 'QR code data URL that encodes the enrollment URL.',
    example: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA...',
  })
  qr: string;

  @ApiProperty({
    description: 'Whether the secret is still pending confirmation.',
    example: true,
  })
  pending: boolean;
}

export class LoginSetupResponseDto extends TwoFactorProvisioningDto {
  @ApiProperty({
    description: 'Signals the client must complete 2FA enrollment first.',
    example: true,
  })
  requiresSetup: boolean;

  @ApiProperty({
    description: 'Short-lived token scoped to the 2FA setup flow.',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
  })
  tempToken: string;
}

export class LoginSetupDataResponseDto {
  @ApiProperty({ type: () => LoginSetupResponseDto })
  data: LoginSetupResponseDto;
}

export class LoginTwoFactorResponseDto {
  @ApiProperty({
    description: 'Signals the client must verify a TOTP code next.',
    example: true,
  })
  requires2FA: boolean;

  @ApiProperty({
    description: 'Short-lived token scoped to the 2FA verification flow.',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
  })
  tempToken: string;
}

export class LoginTwoFactorDataResponseDto {
  @ApiProperty({ type: () => LoginTwoFactorResponseDto })
  data: LoginTwoFactorResponseDto;
}

export class AuthSessionUserDto {
  @ApiProperty({
    description: 'Authenticated user id.',
    example: '43566ec8-22af-41d3-933a-918b536fe99f',
  })
  id: string;

  @ApiProperty({
    description: 'Authenticated user email.',
    example: 'operator@example.com',
  })
  email: string;

  @ApiProperty({ description: 'Authenticated user role.', enum: ValidRoles })
  role: ValidRoles;

  @ApiProperty({ description: 'Whether 2FA is enabled for the session.' })
  isTwoFactorEnabled: boolean;

  @ApiProperty({ description: 'Whether 2FA was validated for the session.' })
  isTwoFactorValidated: boolean;

  @ApiProperty({
    description: 'Owning client id, when the session belongs to a child user.',
    example: 'de69dcfb-ca41-4b7b-9685-aabd64e83982',
    nullable: true,
    type: String,
  })
  clientId: string | null;

  @ApiProperty({
    description: 'Whether the session must change password next.',
    nullable: true,
    type: Boolean,
  })
  mustChangePassword: boolean | null;
}

export class AuthSessionResponseDto {
  @ApiProperty({
    description: 'Current session user in camelCase.',
    type: () => AuthSessionUserDto,
  })
  user: AuthSessionUserDto;

  @ApiProperty({
    description: 'Refreshed access token for the session.',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
  })
  token: string;
}

export class AuthSessionDataResponseDto {
  @ApiProperty({ type: () => AuthSessionResponseDto })
  data: AuthSessionResponseDto;
}

export class VerifiedSessionResponseDto {
  @ApiProperty({
    description: 'Access token issued after 2FA verification.',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
  })
  accessToken: string;

  @ApiProperty({
    description: 'Verified user, serialized with the Etapa 2 user contract.',
    type: () => UserDetailResponseDto,
  })
  user: UserDetailResponseDto;
}

export class VerifiedSessionDataResponseDto {
  @ApiProperty({ type: () => VerifiedSessionResponseDto })
  data: VerifiedSessionResponseDto;
}

export class PasswordChangeResponseDto {
  @ApiProperty({
    description: 'Result of the password change.',
    example: 'Password changed successfully',
  })
  message: string;
}

export class PasswordChangeDataResponseDto {
  @ApiProperty({ type: () => PasswordChangeResponseDto })
  data: PasswordChangeResponseDto;
}

export class RecoveryVerifiedResponseDto {
  @ApiProperty({
    description: 'Result of the recovery 2FA verification.',
    example: 'Code verified',
  })
  message: string;

  @ApiProperty({
    description: 'Short-lived token scoped to the recovery flow.',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
  })
  tempToken: string;

  @ApiProperty({
    description: 'User id that may now change its password.',
    example: '43566ec8-22af-41d3-933a-918b536fe99f',
  })
  userId: string;

  @ApiProperty({
    description: 'Signals the client must change the password next.',
    example: true,
  })
  requiresPasswordChange: boolean;
}

export class RecoveryVerifiedDataResponseDto {
  @ApiProperty({ type: () => RecoveryVerifiedResponseDto })
  data: RecoveryVerifiedResponseDto;
}

export class TwoFactorSetupResponseDto extends TwoFactorProvisioningDto {}

export class TwoFactorSetupDataResponseDto {
  @ApiProperty({ type: () => TwoFactorSetupResponseDto })
  data: TwoFactorSetupResponseDto;
}

export class TwoFactorEnableResponseDto {
  @ApiProperty({
    description: 'Result of the 2FA confirmation.',
    example: '2FA enabled',
  })
  message: string;
}

export class TwoFactorEnableDataResponseDto {
  @ApiProperty({ type: () => TwoFactorEnableResponseDto })
  data: TwoFactorEnableResponseDto;
}

export class TwoFactorDisableResponseDto {
  @ApiProperty({
    description: 'Result of the 2FA deactivation.',
    example: '2FA disabled',
  })
  message: string;
}

export class TwoFactorDisableDataResponseDto {
  @ApiProperty({ type: () => TwoFactorDisableResponseDto })
  data: TwoFactorDisableResponseDto;
}

export class DiscordLinkResponseDto {
  @ApiProperty({
    description: 'Discord authorization URL for the authenticated user.',
    example: 'https://discord.com/oauth2/authorize?client_id=abc',
  })
  url: string;
}

export class DiscordLinkDataResponseDto {
  @ApiProperty({ type: () => DiscordLinkResponseDto })
  data: DiscordLinkResponseDto;
}

export class DiscordTicketResponseDto {
  @ApiProperty({
    description:
      'One-time Discord login ticket. The frontend POSTs it to /auth/discord/exchange.',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
  })
  code: string;
}

export class DiscordTicketDataResponseDto {
  @ApiProperty({ type: () => DiscordTicketResponseDto })
  data: DiscordTicketResponseDto;
}
