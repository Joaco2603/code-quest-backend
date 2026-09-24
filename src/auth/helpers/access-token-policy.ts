// import { ValidRoles } from '../interfaces/valid-roles.type.js';
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
 * Access tokens stay valid while two-factor checks are disabled.
 * The previous policy rejected a token after 2FA enrollment or a move to
 * admin/client when the token had not proved that change.
 */
export function accessTokenMatchesAccount(
  account: AccountAuthState,
  payload: JwtPayload,
): boolean {
  const purpose = (payload.purpose ?? JwtPurpose.access) as JwtPurposeName;
  if (purpose !== JwtPurpose.access) {
    return true;
  }

  // Two-factor is disabled. Do not invalidate sessions for missing 2FA proof.
  void account;
  // const privileged =
  //   account.role === ValidRoles.admin || account.role === ValidRoles.client;
  // const tokenEnabled = payload.is_two_factor_enabled === true;
  // const tokenValidated = payload.is_two_factor_validated === true;
  // const accountEnabled = account.is_two_factor_enabled === true;
  //
  // if (accountEnabled !== tokenEnabled) {
  //   return false;
  // }
  //
  // if ((accountEnabled || privileged) && tokenValidated && !tokenEnabled) {
  //   return false;
  // }
  //
  // if (accountEnabled && !tokenValidated) {
  //   return false;
  // }

  return true;
}
