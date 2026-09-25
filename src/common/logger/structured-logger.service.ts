import { ConsoleLogger, Injectable, LogLevel } from '@nestjs/common';
import { requestContext } from '../request-context/request-context.js';

type StructuredPayload = {
  timestamp: string;
  level: LogLevel | 'fatal' | 'info';
  message: unknown;
  context?: string;
  requestId?: string;
  userId?: string;
  path?: string;
  method?: string;
  stack?: string;
  metadata?: Record<string, unknown>;
};

@Injectable()
export class StructuredLoggerService extends ConsoleLogger {
  constructor() {
    super();
  }

  log(message: unknown, context?: string) {
    this.write('log', message, context);
  }

  error(message: unknown, stack?: string, context?: string) {
    this.write('error', message, context, stack);
  }

  warn(message: unknown, context?: string) {
    this.write('warn', message, context);
  }

  debug(message: unknown, context?: string) {
    this.write('debug', message, context);
  }

  verbose(message: unknown, context?: string) {
    this.write('verbose', message, context);
  }

  fatal(message: unknown, stack?: string, context?: string) {
    this.write('fatal', message, context, stack);
  }

  private write(
    level: LogLevel | 'fatal',
    message: unknown,
    context?: string,
    stack?: string,
  ) {
    const currentContext = requestContext.get();
    const payload = this.buildPayload(
      level,
      message,
      context,
      stack,
      currentContext,
    );
    const pretty =
      process.env.LOG_FORMAT === 'pretty' ||
      (!process.env.LOG_FORMAT && process.env.NODE_ENV === 'development');
    const line = pretty ? this.pretty(payload) : JSON.stringify(payload);

    switch (level) {
      case 'error':
      case 'fatal':
        process.stderr.write(`${line}\n`);
        return;
      default:
        process.stdout.write(`${line}\n`);
    }
  }

  private buildPayload(
    level: LogLevel | 'fatal',
    message: unknown,
    context: string | undefined,
    stack: string | undefined,
    currentContext: ReturnType<typeof requestContext.get>,
  ): StructuredPayload {
    const metadata =
      message &&
      typeof message === 'object' &&
      !Array.isArray(message) &&
      !(message instanceof Error)
        ? (message as Record<string, unknown>)
        : undefined;

    return this.compact({
      timestamp: new Date().toISOString(),
      level: level === 'log' ? 'info' : level,
      context,
      requestId: currentContext?.requestId,
      userId: currentContext?.userId,
      path: currentContext?.path,
      method: currentContext?.method,
      stack: stack ?? (message instanceof Error ? message.stack : undefined),
      metadata: metadata
        ? Object.fromEntries(
            Object.entries(metadata).filter(
              ([key]) =>
                !['message', 'method', 'path', 'requestId'].includes(key),
            ),
          )
        : undefined,
      message: metadata
        ? typeof metadata.message === 'string'
          ? metadata.message
          : typeof metadata.event === 'string'
            ? metadata.event
            : 'Structured event'
        : this.normalizeMessage(message),
      ...(typeof metadata?.method === 'string'
        ? { method: metadata.method }
        : {}),
      ...(typeof metadata?.path === 'string' ? { path: metadata.path } : {}),
      ...(typeof metadata?.requestId === 'string'
        ? { requestId: metadata.requestId }
        : {}),
    });
  }

  private pretty(payload: StructuredPayload): string {
    const { statusCode, durationMs, ...details } = payload.metadata ?? {};
    const fields = [
      new Intl.DateTimeFormat('sv-SE', {
        timeZone: process.env.LOG_TIMEZONE || 'America/Argentina/Buenos_Aires',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        fractionalSecondDigits: 3,
        hourCycle: 'h23',
        timeZoneName: 'shortOffset',
      })
        .format(new Date(payload.timestamp))
        .replace('−', '-'),
      payload.level.toUpperCase(),
      payload.method,
      payload.path,
      statusCode,
      durationMs === undefined ? undefined : `${this.text(durationMs)}ms`,
      payload.message,
      payload.requestId ? `rid=${payload.requestId}` : undefined,
      payload.context ? `context=${payload.context}` : undefined,
      payload.userId ? `userId=${payload.userId}` : undefined,
      Object.keys(details).length ? JSON.stringify(details) : undefined,
    ];
    // Escape control characters in client-controlled paths/IDs; one event per line.
    const line = fields
      .filter((value) => value !== undefined)
      .map((value) =>
        this.text(value)
          .replaceAll('\n', '\\n')
          .replaceAll('\r', '\\r')
          .replaceAll('\t', '\\t')
          .replaceAll('\x1b', '\\u001b'),
      )
      .join(' ');
    return payload.stack ? `${line}\n${payload.stack}` : line;
  }

  private text(value: unknown): string {
    return typeof value === 'string' ? value : (JSON.stringify(value) ?? '');
  }

  private normalizeMessage(message: unknown) {
    if (message instanceof Error) {
      return message.message;
    }

    if (typeof message === 'string') {
      return message;
    }

    return message ?? '';
  }

  private compact(payload: StructuredPayload): StructuredPayload {
    return Object.fromEntries(
      Object.entries(payload).filter(([, value]) => value !== undefined),
    ) as StructuredPayload;
  }
}
