import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EncryptionService } from './encryption/encryption.service';
import { AuditLog } from './entities/audit-log.entity';
import { GlobalExceptionFilter } from './filters/global-exception.filter';
import { RateLimitGuard } from './guards/rate-limit.guard';
import { HttpLoggingInterceptor } from './interceptors/http-logging.interceptor';
import { StructuredLoggerService } from './logger/structured-logger.service';
import { AuditLogService } from './services/audit-log.service';

@Module({
  imports: [ConfigModule, TypeOrmModule.forFeature([AuditLog])],
  providers: [
    EncryptionService,
    StructuredLoggerService,
    AuditLogService,
    GlobalExceptionFilter,
    HttpLoggingInterceptor,
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
export class CommonModule {}
