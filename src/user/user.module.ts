import { Module } from '@nestjs/common';
import { UserService } from './user.service.js';
import { UserController } from './user.controller.js';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from './entities/user.entity.js';
import { PassportModule } from '@nestjs/passport';
import { UserExistsValidator } from './validators/user-exists.validator.js';
import { CommonModule } from '../common/common.module.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([User]),
    PassportModule.register({ defaultStrategy: 'jwt' }),
    CommonModule,
  ],
  controllers: [UserController],
  providers: [UserService, UserExistsValidator],
  exports: [UserService, UserExistsValidator, TypeOrmModule],
})
export class UserModule {}
