import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, from } from 'rxjs';
import { mergeMap } from 'rxjs/operators';
import { requestContext } from '../request-context/request-context.js';
import { StructuredLoggerService } from '../logger/structured-logger.service.js';
import { AuditLogService } from '../services/audit-log.service.js';

@Injectable()
export class HttpLoggingInterceptor implements NestInterceptor {
  constructor(
    private readonly logger: StructuredLoggerService,
    private readonly auditLogService: AuditLogService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType<'http' | 'ws' | 'rpc'>() !== 'http') {
      return next.handle();
    }

    const startedAt = Date.now();
    const http = context.switchToHttp();
    const request = http.getRequest<{
      method: string;
      originalUrl?: string;
      ip?: string;
      user?: {
        id?: string;
        role?: string;
      };
      headers?: Record<string, string | string[] | undefined>;
    }>();
    const response = http.getResponse<{
      statusCode: number;
    }>();

    requestContext.set({
      userId: request.user?.id,
      userRole: request.user?.role,
      method: request.method,
      path: request.originalUrl,
      ip: request.ip,
    });

    return next.handle().pipe(
      mergeMap((value) =>
        from(
          (async () => {
            const durationMs = Date.now() - startedAt;
            this.logger.log(
              {
                event: 'http.request.completed',
                statusCode: response.statusCode,
                durationMs,
                ip: request.ip,
                userAgent: request.headers?.['user-agent'],
              },
              HttpLoggingInterceptor.name,
            );

            await this.auditLogService.recordHttpEvent({
              statusCode: response.statusCode,
              outcome: 'success',
              eventType: 'http.request.completed',
              durationMs,
              method: request.method,
              path: request.originalUrl,
              ip: request.ip,
              userAgent: this.normalizeHeader(request.headers?.['user-agent']),
              userId: request.user?.id,
              userRole: request.user?.role,
            });

            return value;
          })(),
        ),
      ),
    );
  }

  private normalizeHeader(value: string | string[] | undefined) {
    if (Array.isArray(value)) {
      return value.join(', ');
    }

    return value ?? undefined;
  }
}
