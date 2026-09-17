export interface Hash {
  hashing(password: string, saltPassword?: number): Promise<string>;
  compareHash(password: string, userPassword: string): Promise<boolean>;
}
