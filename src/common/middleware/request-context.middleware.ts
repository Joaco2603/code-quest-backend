import { Injectable, NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { NextFunction, Request, Response } from 'express';
import { requestContext } from '../request-context/request-context.js';

@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    const incomingRequestId = req.header('x-request-id');
    const requestId =
      typeof incomingRequestId === 'string' && incomingRequestId.trim()
        ? incomingRequestId.trim()
        : randomUUID();

    res.setHeader('X-Request-Id', requestId);

    requestContext.run(
      {
        requestId,
        method: req.method,
        path: req.originalUrl ?? req.url,
        ip: req.ip,
      },
      () => {
        (
          req as Request & {
            requestId?: string;
          }
        ).requestId = requestId;
        next();
      },
    );
  }
}
