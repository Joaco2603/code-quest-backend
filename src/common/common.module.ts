import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EncryptionService } from './encryption/encryption.service.js';
import { AuditLog } from './entities/audit-log.entity.js';
import { GlobalExceptionFilter } from './filters/global-exception.filter.js';
import { RateLimitGuard } from './guards/rate-limit.guard.js';
import { HttpLoggingInterceptor } from './interceptors/http-logging.interceptor.js';
import { StructuredLoggerService } from './logger/structured-logger.service.js';
import { AuditLogService } from './services/audit-log.service.js';
import { RequestContextMiddleware } from './middleware/request-context.middleware.js';

@Module({
  imports: [ConfigModule, TypeOrmModule.forFeature([AuditLog])],
  providers: [
    EncryptionService,
    StructuredLoggerService,
    AuditLogService,
    RequestContextMiddleware,
    GlobalExceptionFilter,
    HttpLoggingInterceptor,
    {
      provide: APP_FILTER,
      useClass: GlobalExceptionFilter,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: HttpLoggingInterceptor,
    },
    {
      provide: APP_GUARD,
      useClass: RateLimitGuard,
    },
  ],
  exports: [
    EncryptionService,
    StructuredLoggerService,
    AuditLogService,
    GlobalExceptionFilter,
    HttpLoggingInterceptor,
  ],
})
export class CommonModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestContextMiddleware).forRoutes('*');
  }
}
