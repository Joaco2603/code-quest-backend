import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';
import { requestContext } from '../request-context/request-context.js';
import { StructuredLoggerService } from '../logger/structured-logger.service.js';
import { AuditLogService } from '../services/audit-log.service.js';
import { requestNetwork } from '../helpers/request-network.js';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  constructor(
    private readonly logger: StructuredLoggerService,
    private readonly auditLogService: AuditLogService,
  ) {}

  async catch(exception: unknown, host: ArgumentsHost) {
    if (host.getType() === 'http') {
      await this.handleHttpException(exception, host);
      return;
    }

    this.logger.error(exception, undefined, GlobalExceptionFilter.name);
  }

  private async handleHttpException(exception: unknown, host: ArgumentsHost) {
    const http = host.switchToHttp();
    const response = http.getResponse<Response>();
    const request = http.getRequest<{
      method?: string;
      originalUrl?: string;
      requestId?: string;
      ip?: string;
      socket?: { remoteAddress?: string };
      user?: {
        id?: string;
        role?: string;
      };
      headers?: Record<string, string | string[] | undefined>;
    }>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;
    const responseBody = this.normalizeHttpResponse(status, exception);
    const stack = exception instanceof Error ? exception.stack : undefined;

    const logPayload = {
      event:
        status === HttpStatus.NOT_FOUND ? 'http.not_found' : 'http.exception',
      statusCode: status,
      requestId: request.requestId,
      reason: requestContext.get()?.authFailureReason,
      durationMs:
        requestContext.get()?.startedAt === undefined
          ? undefined
          : Date.now() - requestContext.get()!.startedAt!,
      path: request.originalUrl,
      method: request.method,
      response: responseBody,
      ...requestNetwork(request),
      userAgent: this.normalizeHeader(request.headers?.['user-agent']),
    };

    if (status >= 400 && status < 500) {
      // Expected client rejections do not need framework stack traces.
      this.logger.warn(logPayload, GlobalExceptionFilter.name);
    } else {
      this.logger.error(logPayload, stack, GlobalExceptionFilter.name);
    }

    await this.auditLogService.recordHttpEvent({
      statusCode: status,
      outcome: status < 500 ? 'warning' : 'error',
      eventType:
        status === HttpStatus.NOT_FOUND ? 'http.not_found' : 'http.exception',
      method: request.method,
      path: request.originalUrl,
      ip: request.ip,
      requestId: request.requestId,
      userId: request.user?.id,
      userRole: request.user?.role,
      userAgent: this.normalizeHeader(request.headers?.['user-agent']),
      message:
        typeof responseBody.message === 'string'
          ? responseBody.message
          : 'Request failed',
      metadata: this.compact({
        errors: 'errors' in responseBody ? responseBody.errors : undefined,
      }),
    });

    response.status(status).json({
      ...responseBody,
      requestId: request.requestId ?? requestContext.get()?.requestId,
      timestamp: new Date().toISOString(),
      path: request.originalUrl,
      method: request.method,
    });
  }

  private normalizeHttpResponse(status: number, exception: unknown) {
    if (exception instanceof HttpException) {
      const exceptionResponse = exception.getResponse();
      if (typeof exceptionResponse === 'string') {
        return {
          statusCode: status,
          message: status >= 500 ? 'Internal server error' : exceptionResponse,
        };
      }

      const message = this.extractMessage(exceptionResponse);
      const errors = this.extractErrors(exceptionResponse);

      return this.compact({
        statusCode: status,
        message: status >= 500 ? 'Internal server error' : message,
        errors: status >= 500 ? undefined : errors,
      });
    }

    return {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Internal server error',
    };
  }

  private extractMessage(value: unknown) {
    if (typeof value === 'string') {
      return value;
    }

    if (
      value &&
      typeof value === 'object' &&
      'message' in value &&
      typeof value.message === 'string'
    ) {
      return value.message;
    }

    if (
      value &&
      typeof value === 'object' &&
      'message' in value &&
      Array.isArray(value.message)
    ) {
      return 'Validation failed';
    }

    return 'Request failed';
  }

  private extractErrors(value: unknown) {
    if (
      value &&
      typeof value === 'object' &&
      'message' in value &&
      Array.isArray(value.message)
    ) {
      return value.message;
    }

    return undefined;
  }

  private compact(payload: Record<string, unknown>) {
    return Object.fromEntries(
      Object.entries(payload).filter(([, value]) => value !== undefined),
    );
  }

  private normalizeHeader(value: string | string[] | undefined) {
    if (Array.isArray(value)) {
      return value.join(', ');
    }

    return value ?? undefined;
  }
}
