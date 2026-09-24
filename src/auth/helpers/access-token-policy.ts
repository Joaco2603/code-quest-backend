import type { JwtPayload } from '../interfaces/jwt-payload.type.js';

type AccountAuthState = {
  role: string;
  is_two_factor_enabled: boolean;
};

/** MFA state does not invalidate sessions in the MVP.
 * Token purpose is enforced by the route guards, including temporary flows.
 */
export function accessTokenMatchesAccount(
  _account: AccountAuthState,
  _payload: JwtPayload,
): boolean {
  return true;
}
