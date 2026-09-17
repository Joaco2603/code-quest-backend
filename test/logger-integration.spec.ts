import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import { StructuredLoggerService } from '../dist/common/logger/structured-logger.service.js';

it('constructs the compiled logger without inheriting ConsoleLogger injection tokens', async () => {
  const module = await Test.createTestingModule({
    providers: [StructuredLoggerService],
  }).compile();
  try {
    expect(module.get(StructuredLoggerService)).toBeInstanceOf(StructuredLoggerService);
  } finally {
    await module.close();
  }
});
