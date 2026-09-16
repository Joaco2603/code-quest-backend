import { forwardRef, Module } from '@nestjs/common';
import { AuthService } from './services/auth.service.js';
import { AuthController } from './controllers/auth.controller.js';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BcryptAdapter } from './adapters/bcrypt.adapter.js';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtStrategy } from './strategies/jwt.strategy.js';
import { UserModule } from '../user/user.module.js';
import { User } from '../user/entities/user.entity.js';
import { TwoFactorController } from './controllers/two-factor.controller.js';
import { TwoFactorService } from './services/two-factor.service.js';
import { CommonModule } from '../common/common.module.js';

@Module({
  controllers: [AuthController, TwoFactorController],
  providers: [AuthService, BcryptAdapter, JwtStrategy, TwoFactorService],
  imports: [
    TypeOrmModule.forFeature([User]),
    forwardRef(() => UserModule),
    PassportModule.register({ defaultStrategy: 'jwt' }),
    ConfigModule,
    CommonModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        return {
          secret: configService.get('JWT_SECRET'),
          signOptions: {
            expiresIn: '4h',
          },
        };
      },
    }),
  ],
  exports: [
    TypeOrmModule,
    JwtStrategy,
    PassportModule,
    JwtModule,
    BcryptAdapter,
  ],
})
export class AuthModule {}
