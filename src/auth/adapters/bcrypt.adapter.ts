import { Hash } from '../interfaces/hashing.type.js';
import { hashSync, compareSync } from 'bcrypt';

export class BcryptAdapter implements Hash {
  hashing(password: string, saltPassword: number = 10): string {
    return hashSync(password, saltPassword);
  }

  compareHash(password: string, userPassword: string): boolean {
    return compareSync(password, userPassword);
  }
}
