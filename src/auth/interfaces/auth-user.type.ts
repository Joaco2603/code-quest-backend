import { ValidRoles } from './valid-roles.type.js';
import type { JwtPurpose } from './jwt-purpose.js';

export interface AuthUser {
  id: string;
  email: string;
  is_two_factor_enabled: boolean;
  is_two_factor_validated: boolean;
  role: ValidRoles;
  client_id?: string;
  mustChangePassword?: boolean;
  isRecovery?: boolean;
  purpose?: JwtPurpose;
}
