import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule, ObserveInstrument } from './app.module.js';
import { setupApp } from './config/setup.js';
import { setupSwagger } from './config/swagger.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    instrument: ObserveInstrument,
  });
  const config = app.get(ConfigService);
  setupApp(app, { allowedOrigins: config.get<string[]>('app.allowedOrigins') });
  setupSwagger(app, config);
  app.enableShutdownHooks();
  await app.listen(config.getOrThrow<number>('app.port'));
}
await bootstrap();
