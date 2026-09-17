export interface Hash {
  hashing(password: string, saltPassword?: number): string;
  compareHash(password: string, userPassword: string): boolean;
}
