import { ConfigService } from '@nestjs/config';
import { EncryptionService } from './encryption.service.js';

describe('EncryptionService', () => {
  const key = Buffer.alloc(32, 7).toString('hex');
  let service: EncryptionService;

  beforeEach(() => {
    service = new EncryptionService({
      get: (name: string) => (name === 'ENCRYPTION_KEY' ? key : undefined),
    } as ConfigService);
  });

  it('round-trips plaintext', () => {
    expect(service.decrypt(service.encrypt('secret-value'))).toBe(
      'secret-value',
    );
  });

  it('uses a unique IV per encryption', () => {
    const first = service.encrypt('same-plaintext');
    const second = service.encrypt('same-plaintext');

    expect(first).not.toBe(second);
    expect(first.split(':')).toHaveLength(3);
    expect(second.split(':')).toHaveLength(3);
    expect(first.split(':')[0]).not.toBe(second.split(':')[0]);
  });
});
