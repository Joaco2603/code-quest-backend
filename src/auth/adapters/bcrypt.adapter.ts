import { Hash } from '../interfaces/hashing.type.js';
import { hash, compare } from 'bcrypt';

export const DUMMY_PASSWORD_HASH =
  '$2b$10$4158Ks9zwSuODovrRY8TIeoZlVwvhDBaBdAYEt1CdOkX.aUjkdvP6';

export class BcryptAdapter implements Hash {
  hashing(password: string, saltPassword: number = 10): Promise<string> {
    return hash(password, saltPassword);
  }

  async compareHash(password: string, userPassword: string): Promise<boolean> {
    try {
      return await compare(password, userPassword);
    } catch {
      return false;
    }
  }
}
