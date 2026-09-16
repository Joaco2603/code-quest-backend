import { Hash } from '../interfaces/hashing.type.js';
import { hashSync, compareSync } from 'bcrypt';

export class BcryptAdapter implements Hash {
  hashing<T>(password: string, saltPassword: number = 10): string {
    const passwordHash = hashSync(password, saltPassword);
    return passwordHash;
  }

  compareHash<T>(password: string, userPassword: string): boolean {
    if (!compareSync(password, userPassword)) return false;

    return true;
  }
}