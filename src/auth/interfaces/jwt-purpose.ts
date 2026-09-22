export const JwtPurpose = {
  access: 'access',
  twoFactor: 'two_factor',
  passwordChange: 'password_change',
  recovery: 'recovery',
} as const;

export type JwtPurpose = (typeof JwtPurpose)[keyof typeof JwtPurpose];

export const TEMP_TOKEN_EXPIRES_IN = '10m';
