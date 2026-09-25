import { Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { requestContext } from '../../common/request-context/request-context.js';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  handleRequest<TUser = unknown>(
    err: unknown,
    user: TUser,
    info?: unknown,
  ): TUser {
    if (err || !user) {
      const reason =
        info instanceof Error && info.message === 'No auth token'
          ? 'auth.token_missing'
          : info instanceof Error && info.name === 'TokenExpiredError'
            ? 'auth.token_expired'
            : 'auth.token_invalid';
      requestContext.set({ authFailureReason: reason });
      throw err || new UnauthorizedException('Invalid or expired token');
    }
    return user;
  }
}
