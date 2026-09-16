import { INestApplication, ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
import { parseAllowedOrigins } from './envs.js';

const DEFAULT_ALLOWED_ORIGINS = parseAllowedOrigins(
  process.env.ALLOWED_ORIGINS,
);

type CorsOriginCallback = (err: Error | null, allow?: boolean) => void;

function resolveAllowedOrigins(allowedOrigins?: string[]) {
  if (allowedOrigins?.length) {
    return allowedOrigins;
  }

  return parseAllowedOrigins(process.env.ALLOWED_ORIGINS);
}

function createOriginResolver(allowedOrigins?: string[]) {
  return (origin: string | undefined, callback: CorsOriginCallback) => {
    const origins = resolveAllowedOrigins(allowedOrigins);
    const allowAll = origins.includes('*');

    if (!origin) {
      callback(null, true);
      return;
    }

    if (allowAll || origins.includes(origin)) {
      callback(null, true);
      return;
    }

    callback(new Error('not allowed by cors'));
  };
}

export function buildCorsOptions(allowedOrigins?: string[]) {
  return {
    origin: createOriginResolver(allowedOrigins),
    preflightContinue: false,
    optionsSuccessStatus: 204,
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    credentials: true,
  };
}

export function buildGatewayCorsOptions(allowedOrigins?: string[]) {
  return {
    origin: createOriginResolver(allowedOrigins),
    credentials: true,
  };
}

export function setupValidation(app: INestApplication) {
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true, // Automatically converts compatible types
      },
    }),
  );
}

export function setupHelmet(app: INestApplication) {
  app.use(
    helmet({
      crossOriginEmbedderPolicy: false,
      contentSecurityPolicy: false,
    }),
  );
}

export function setupCors(
  app: INestApplication,
  allowedOrigins: string[] = DEFAULT_ALLOWED_ORIGINS,
) {
  app.enableCors(buildCorsOptions(allowedOrigins));
}

export function setupApp(
  app: INestApplication,
  opts?: { allowedOrigins?: string[] },
) {
  app.setGlobalPrefix('api');
  setupValidation(app);
  setupHelmet(app);
  setupCors(app, opts?.allowedOrigins);
}