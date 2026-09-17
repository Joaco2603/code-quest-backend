import { ConsoleLogger, Injectable, LogLevel } from '@nestjs/common';
import { requestContext } from '../request-context/request-context.js';

type StructuredPayload = {
  timestamp: string;
  level: LogLevel | 'fatal';
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
    const line = JSON.stringify(payload);

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
      level,
      context,
      requestId: currentContext?.requestId,
      userId: currentContext?.userId,
      path: currentContext?.path,
      method: currentContext?.method,
      stack,
      metadata,
      message: this.normalizeMessage(message),
    });
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
