export interface JwtPayload {
  sub: string;
  email?: string;
  rol?: string;
  is_two_factor_enabled?: boolean;
  is_two_factor_validated?: boolean;
  client?: string | null;
  mustChangePassword?: boolean;
  isRecovery?: boolean;
}
