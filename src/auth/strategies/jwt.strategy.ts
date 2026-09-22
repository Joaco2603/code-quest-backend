import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { User } from '../../user/entities/user.entity.js';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { AuthUser } from '../interfaces/auth-user.type.js';
import { JwtPayload } from '../interfaces/jwt-payload.type.js';
import { JwtPurpose } from '../interfaces/jwt-purpose.js';
import { accessTokenMatchesAccount } from '../helpers/access-token-policy.js';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    configService: ConfigService,
  ) {
    const secret =
      configService.get<string>('JWT_SECRET') ??
      configService.get<string>('app.auth.jwtSecret');
    if (!secret) {
      throw new Error('JWT_SECRET is required');
    }

    super({
      secretOrKey: secret,
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
    });
  }

  async validate(payload: JwtPayload): Promise<AuthUser> {
    if (!payload?.sub) {
      throw new UnauthorizedException('Invalid token payload');
    }

    if (
      payload.purpose &&
      !Object.values(JwtPurpose).includes(payload.purpose)
    ) {
      throw new UnauthorizedException('Invalid token payload');
    }

    const user = await this.userRepository.findOne({
      where: { id: payload.sub },
    });

    if (!user) throw new UnauthorizedException('Token not valid');

    if (!user.isActive)
      throw new UnauthorizedException('User is inactive, talk with an admin');

    if (!accessTokenMatchesAccount(user, payload)) {
      throw new UnauthorizedException('Session is no longer valid');
    }

    return {
      id: payload.sub,
      email: payload.email ?? user.email,
      is_two_factor_enabled: user.is_two_factor_enabled,
      is_two_factor_validated: payload.is_two_factor_validated ?? false,
      role: user.role,
      client_id: payload.client ?? user.client?.id,
      mustChangePassword: user.mustChangePassword,
      isRecovery: payload.isRecovery,
      purpose: payload.purpose,
    };
  }
}
