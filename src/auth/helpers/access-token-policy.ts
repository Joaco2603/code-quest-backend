import { ValidRoles } from '../interfaces/valid-roles.type.js';
import {
  JwtPurpose,
  type JwtPurpose as JwtPurposeName,
} from '../interfaces/jwt-purpose.js';
import type { JwtPayload } from '../interfaces/jwt-payload.type.js';

type AccountAuthState = {
  role: string;
  is_two_factor_enabled: boolean;
};

/**
 * An access token is valid only while it still matches the account.
 * Enabling 2FA, or moving the account to admin/client, invalidates a token
 * that was minted without that proof. Challenge tokens stay usable so the
 * user can finish setup.
 */
export function accessTokenMatchesAccount(
  account: AccountAuthState,
  payload: JwtPayload,
): boolean {
  const purpose = (payload.purpose ?? JwtPurpose.access) as JwtPurposeName;
  if (purpose !== JwtPurpose.access) {
    return true;
  }

  const privileged =
    account.role === ValidRoles.admin || account.role === ValidRoles.client;
  const tokenEnabled = payload.is_two_factor_enabled === true;
  const tokenValidated = payload.is_two_factor_validated === true;
  const accountEnabled = account.is_two_factor_enabled === true;

  if (accountEnabled !== tokenEnabled) {
    return false;
  }

  if ((accountEnabled || privileged) && tokenValidated && !tokenEnabled) {
    return false;
  }

  if (accountEnabled && !tokenValidated) {
    return false;
  }

  return true;
}
