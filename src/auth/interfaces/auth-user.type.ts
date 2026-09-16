import { ValidRoles } from './valid-roles.type.js';

export interface AuthUser {
  id: string;
  email: string;
  is_two_factor_enabled: boolean;
  is_two_factor_validated: boolean;
  role: ValidRoles;
  client_id?: string;
  mustChangePassword?: boolean;
  isRecovery?: boolean;
}
