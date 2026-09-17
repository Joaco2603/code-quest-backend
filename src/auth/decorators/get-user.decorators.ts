import {
  ExecutionContext,
  InternalServerErrorException,
  createParamDecorator,
} from '@nestjs/common';
import { AuthUser } from '../interfaces/auth-user.type.js';

export const GetUser = createParamDecorator(
  (data: Array<keyof AuthUser> | undefined, ctx: ExecutionContext) => {
    const req = ctx.switchToHttp().getRequest<{ user?: AuthUser }>();
    const user = req.user;

    if (!user) {
      throw new InternalServerErrorException('User not found (request)');
    }

    if (!data) return user;

    return data.reduce<Partial<AuthUser>>((selected, key) => {
      selected[key] = user[key] as never;
      return selected;
    }, {});
  },
);
