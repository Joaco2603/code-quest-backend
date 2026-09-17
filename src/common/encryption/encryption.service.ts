import { Injectable } from '@nestjs/common';
import { randomBytes, createCipheriv, createDecipheriv } from 'crypto';
import { ConfigService } from '@nestjs/config';

const AES_256_GCM_KEY_BYTES = 32;
const GCM_IV_BYTES = 12;

@Injectable()
export class EncryptionService {
  private readonly key: Buffer;
  private readonly legacyIv: Buffer | null;

  constructor(private readonly config: ConfigService) {
    const keyHex = this.config.get<string>('ENCRYPTION_KEY');
    if (!keyHex) {
      throw new Error('ENCRYPTION_KEY is required');
    }

    this.key = Buffer.from(keyHex, 'hex');
    if (this.key.length !== AES_256_GCM_KEY_BYTES) {
      throw new Error('ENCRYPTION_KEY must be 32 bytes encoded as hex');
    }

    const legacyIvHex = this.config.get<string>('ENCRYPTION_IV');
    this.legacyIv = legacyIvHex ? Buffer.from(legacyIvHex, 'hex') : null;
  }

  encrypt(text: string): string {
    const iv = randomBytes(GCM_IV_BYTES);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const encrypted = Buffer.concat([
      cipher.update(text, 'utf8'),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();

    return `${iv.toString('hex')}:${encrypted.toString('hex')}:${tag.toString('hex')}`;
  }

  decrypt(cipherText: string): string {
    const parts = cipherText.split(':');

    if (parts.length === 3) {
      const [ivHex, encryptedHex, tagHex] = parts;
      return this.decryptWithIv(
        Buffer.from(ivHex, 'hex'),
        encryptedHex,
        tagHex,
      );
    }

    if (parts.length === 2 && this.legacyIv) {
      const [encryptedHex, tagHex] = parts;
      return this.decryptWithIv(this.legacyIv, encryptedHex, tagHex);
    }

    throw new Error('Invalid ciphertext format');
  }

  private decryptWithIv(iv: Buffer, encryptedHex: string, tagHex: string) {
    const decipher = createDecipheriv('aes-256-gcm', this.key, iv);
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(encryptedHex, 'hex')),
      decipher.final(),
    ]);
    return decrypted.toString('utf8');
  }
}
