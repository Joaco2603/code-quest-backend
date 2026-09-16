import {
  Injectable,
  OnApplicationShutdown,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLog } from '../entities/audit-log.entity';
import { requestContext } from '../request-context/request-context';
import { StructuredLoggerService } from '../logger/structured-logger.service';

export type CreateAuditLogInput = {
  statusCode: number;
  outcome: 'success' | 'error' | 'warning';
  eventType: string;
  method?: string;
  path?: string;
  ip?: string;
  userAgent?: string;
  durationMs?: number;
  message?: string;
  metadata?: Record<string, unknown>;
  requestId?: string;
  userId?: string;
  userRole?: string;
};

type AuditLogWriteModel = {
  request_id: string | null;
  user_id: string | null;
  user_role: string | null;
  method: string;
  path: string;
  status_code: number;
  outcome: 'success' | 'error' | 'warning';
  event_type: string;
  ip: string | null;
  user_agent: string | null;
  duration_ms: number | null;
  message: string | null;
  metadata: Record<string, unknown> | null;
};

@Injectable()
export class AuditLogService implements OnModuleInit, OnApplicationShutdown {
  private readonly buffer: AuditLogWriteModel[] = [];
  private flushTimer: NodeJS.Timeout | null = null;
  private flushInFlight: Promise<void> | null = null;
  private readonly bufferSize: number;
  private readonly flushIntervalMs: number;

  constructor(
    @InjectRepository(AuditLog)
    private readonly auditLogRepository: Repository<AuditLog>,
    private readonly configService: ConfigService,
    private readonly logger: StructuredLoggerService,
  ) {
    const auditConfig = this.configService.get<{
      bufferSize?: number;
      flushIntervalMs?: number;
    }>('app.audit');

    this.bufferSize = auditConfig?.bufferSize ?? 50;
    this.flushIntervalMs = auditConfig?.flushIntervalMs ?? 2000;
  }

  onModuleInit() {
    this.flushTimer = setInterval(() => {
      void this.flushBufferedLogs();
    }, this.flushIntervalMs);
    this.flushTimer.unref?.();
  }

  async onApplicationShutdown() {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }

    await this.flushBufferedLogs(true);
  }

  async recordHttpEvent(input: CreateAuditLogInput): Promise<void> {
    this.buffer.push(this.normalizeInput(input));

    if (this.buffer.length >= this.bufferSize) {
      void this.flushBufferedLogs();
    }
  }

  async recordDomainEvent(input: CreateAuditLogInput): Promise<void> {
    await this.recordHttpEvent({
      statusCode: input.statusCode,
      outcome: input.outcome,
      eventType: input.eventType,
      method: input.method ?? 'SYSTEM',
      path: input.path ?? 'domain',
      ip: input.ip,
      userAgent: input.userAgent,
      durationMs: input.durationMs,
      message: input.message,
      metadata: input.metadata,
      requestId: input.requestId,
      userId: input.userId,
      userRole: input.userRole,
    });
  }

  private normalizeInput(input: CreateAuditLogInput): AuditLogWriteModel {
    const context = requestContext.get();

    return {
      request_id: this.truncate(input.requestId ?? context?.requestId, 64),
      user_id: input.userId ?? context?.userId ?? null,
      user_role: this.truncate(input.userRole ?? context?.userRole, 64),
      method: this.truncate(
        (input.method ?? context?.method ?? 'UNKNOWN').toUpperCase(),
        16,
      )!,
      path: input.path ?? context?.path ?? 'unknown',
      status_code: input.statusCode,
      outcome: input.outcome,
      event_type: this.truncate(input.eventType, 64)!,
      ip: this.truncate(input.ip ?? context?.ip, 64),
      user_agent: input.userAgent ?? null,
      duration_ms: input.durationMs ?? null,
      message: input.message ?? null,
      metadata: input.metadata ?? null,
    };
  }

  private async flushBufferedLogs(force = false): Promise<void> {
    if (this.flushInFlight) {
      await this.flushInFlight;
      return;
    }

    if (!force && this.buffer.length === 0) {
      return;
    }

    const batch = this.buffer.splice(0, this.buffer.length);
    if (batch.length === 0) {
      return;
    }

    this.flushInFlight = this.insertBatch(batch)
      .then(() => undefined)
      .catch((error) => {
        this.logger.error(
          {
            event: 'audit.flush.failed',
            batchSize: batch.length,
            message: 'Buffered audit log flush failed',
          },
          error instanceof Error ? error.stack : undefined,
          AuditLogService.name,
        );

        this.buffer.unshift(...batch);
      })
      .finally(() => {
        this.flushInFlight = null;
      });

    await this.flushInFlight;
  }

  private async insertBatch(batch: AuditLogWriteModel[]): Promise<void> {
    try {
      await this.auditLogRepository.insert(batch);
      return;
    } catch (error) {
      const safeBatch = batch.map((entry) => this.toLegacySafeEntry(entry));
      await this.auditLogRepository.insert(safeBatch).catch((safeError) => {
        this.logger.error(
          {
            event: 'audit.flush.safe_retry_failed',
            batchSize: safeBatch.length,
            message:
              'Buffered audit log safe retry failed. Dropping batch to avoid infinite retry loop.',
          },
          safeError instanceof Error ? safeError.stack : undefined,
          AuditLogService.name,
        );
      });
    }
  }

  private toLegacySafeEntry(entry: AuditLogWriteModel): AuditLogWriteModel {
    return {
      ...entry,
      request_id: this.truncate(entry.request_id, 64),
      user_role: this.truncate(entry.user_role, 64),
      method: this.truncate(entry.method, 16) ?? 'UNKNOWN',
      path: this.truncate(entry.path, 255) ?? 'unknown',
      outcome: entry.outcome,
      event_type: this.truncate(entry.event_type, 64) ?? 'unknown',
      ip: this.truncate(entry.ip, 64),
      user_agent: this.truncate(entry.user_agent, 255),
      message: this.truncate(entry.message, 255),
    };
  }

  private truncate(value: string | null | undefined, maxLength: number) {
    if (value == null) return null;
    return value.length > maxLength ? value.slice(0, maxLength) : value;
  }
}
