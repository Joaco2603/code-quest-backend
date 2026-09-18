import type { User } from '../../user/entities/user.entity.js';
import { serializeUserDetail } from '../../user/serializers/user.serializer.js';
import type { AuthUser } from '../interfaces/auth-user.type.js';
import type {
  AuthRegisterResponseDto,
  AuthSessionResponseDto,
  AuthSessionUserDto,
  DiscordLinkResponseDto,
  DiscordTicketResponseDto,
  LoginPasswordChangeResponseDto,
  LoginSetupResponseDto,
  LoginTwoFactorResponseDto,
  PasswordChangeResponseDto,
  RecoveryVerifiedResponseDto,
  TwoFactorDisableResponseDto,
  TwoFactorEnableResponseDto,
  TwoFactorProvisioningDto,
  TwoFactorSetupResponseDto,
  VerifiedSessionResponseDto,
} from '../dtos/auth-response.dto.js';

/**
 * Explicit auth serializers: pick every public field by hand.
 *
 * Services return raw results (entities or challenge payloads) and never
 * wrap them in `{ data }`. Controllers wrap exactly once with
 * `toDataResponse`. Provisioning material only flows through the setup
 * serializers; every other variant omits `secret`, `otpauthUrl` and `qr`
 * by construction.
 */
export type PasswordChangeChallenge = {
  requiresPasswordChange: true;
  userId: string;
  tempToken: string;
};

export type SetupChallenge = {
  requiresSetup: true;
  secret: string;
  otpauthUrl: string;
  qr: string;
  pending: boolean;
  tempToken: string;
};

export type TwoFactorChallenge = {
  requires2FA: true;
  tempToken: string;
};

export type LoginChallenge =
  | PasswordChangeChallenge
  | SetupChallenge
  | TwoFactorChallenge;

export type VerifiedSessionResult = {
  accessToken: string;
  user: User;
};

export type DiscordExchangeResult = LoginChallenge | VerifiedSessionResult;

export function isVerifiedSessionResult(
  result: DiscordExchangeResult,
): result is VerifiedSessionResult {
  return 'user' in result && 'accessToken' in result;
}

export function serializeRegisteredSession(
  user: User,
  token: string,
): AuthRegisterResponseDto {
  return {
    user: serializeUserDetail(user),
    token,
  };
}

export function serializeAuthSessionUser(
  source: AuthUser,
): AuthSessionUserDto {
  return {
    id: source.id,
    email: source.email,
    role: source.role,
    isTwoFactorEnabled: source.is_two_factor_enabled,
    isTwoFactorValidated: source.is_two_factor_validated,
    clientId: source.client_id ?? null,
    mustChangePassword: source.mustChangePassword ?? null,
  };
}

export function serializeSessionStatus(
  source: AuthUser,
  token: string,
): AuthSessionResponseDto {
  return {
    user: serializeAuthSessionUser(source),
    token,
  };
}

export function serializeLoginPasswordChange(
  source: PasswordChangeChallenge,
): LoginPasswordChangeResponseDto {
  return {
    requiresPasswordChange: true,
    userId: source.userId,
    tempToken: source.tempToken,
  };
}

export function serializeProvisioning(
  source: TwoFactorProvisioningDto,
): TwoFactorProvisioningDto {
  return {
    secret: source.secret,
    otpauthUrl: source.otpauthUrl,
    qr: source.qr,
    pending: source.pending,
  };
}

export function serializeLoginSetup(
  source: SetupChallenge,
): LoginSetupResponseDto {
  const provisioning = serializeProvisioning(source);
  return {
    requiresSetup: true,
    secret: provisioning.secret,
    otpauthUrl: provisioning.otpauthUrl,
    qr: provisioning.qr,
    pending: provisioning.pending,
    tempToken: source.tempToken,
  };
}

export function serializeLoginTwoFactor(
  source: TwoFactorChallenge,
): LoginTwoFactorResponseDto {
  return {
    requires2FA: true,
    tempToken: source.tempToken,
  };
}

export function serializeLoginChallenge(
  source: LoginChallenge,
): (
  | LoginPasswordChangeResponseDto
  | LoginSetupResponseDto
  | LoginTwoFactorResponseDto
) {
  if ('requiresPasswordChange' in source) {
    return serializeLoginPasswordChange(source);
  }
  if ('requiresSetup' in source) {
    return serializeLoginSetup(source);
  }
  return serializeLoginTwoFactor(source);
}

export function serializeVerifiedSession(
  user: User,
  accessToken: string,
): VerifiedSessionResponseDto {
  return {
    accessToken,
    user: serializeUserDetail(user),
  };
}

export function serializeDiscordExchangeResult(
  source: DiscordExchangeResult,
): (
  | LoginPasswordChangeResponseDto
  | LoginSetupResponseDto
  | LoginTwoFactorResponseDto
  | VerifiedSessionResponseDto
) {
  if (isVerifiedSessionResult(source)) {
    return serializeVerifiedSession(source.user, source.accessToken);
  }
  return serializeLoginChallenge(source);
}

export function serializePasswordChangeResult(source: {
  message: string;
}): PasswordChangeResponseDto {
  return { message: source.message };
}

export function serializeRecoveryVerifiedResult(source: {
  message: string;
  tempToken: string;
  userId: string;
  requiresPasswordChange: true;
}): RecoveryVerifiedResponseDto {
  return {
    message: source.message,
    tempToken: source.tempToken,
    userId: source.userId,
    requiresPasswordChange: true,
  };
}

export function serializeTwoFactorSetup(source: {
  secret: string;
  otpauthUrl: string;
  qr: string;
  pending: boolean;
}): TwoFactorSetupResponseDto {
  return serializeProvisioning(source);
}

export function serializeTwoFactorEnable(source: {
  message: string;
}): TwoFactorEnableResponseDto {
  return { message: source.message };
}

export function serializeTwoFactorDisable(source: {
  message: string;
}): TwoFactorDisableResponseDto {
  return { message: source.message };
}

export function serializeDiscordLink(url: string): DiscordLinkResponseDto {
  return { url };
}

export function serializeDiscordTicket(code: string): DiscordTicketResponseDto {
  return { code };
}
