import { Injectable } from '@nestjs/common';
import * as crypto from 'crypto';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class EncryptionService {
  private readonly key: Buffer;
  private readonly iv: Buffer;

  constructor(private readonly config: ConfigService) {
    this.key = Buffer.from(this.config.get<string>('ENCRYPTION_KEY'), 'hex');
    this.iv = Buffer.from(this.config.get<string>('ENCRYPTION_IV'), 'hex');
  }

  encrypt(text: string): string {
    const cipher = crypto.createCipheriv('aes-256-gcm', this.key, this.iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const tag = cipher.getAuthTag().toString('hex');
    return `${encrypted}:${tag}`;
  }

  decrypt(cipherText: string): string {
    const [encrypted, tag] = cipherText.split(':');
    const decipher = crypto.createDecipheriv('aes-256-gcm', this.key, this.iv);
    decipher.setAuthTag(Buffer.from(tag, 'hex'));
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  }
}
