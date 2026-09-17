import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule, ObserveInstrument } from './app.module.js';
import { setupApp } from './config/setup.js';
import { setupSwagger } from './config/swagger.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    instrument: ObserveInstrument,
  });
  const configService = app.get(ConfigService);
  setupApp(app);
  setupSwagger(app, configService);
  await app.listen(configService.get('app.port') ?? process.env.PORT ?? 3000);
}
await bootstrap();
