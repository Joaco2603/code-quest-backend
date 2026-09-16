import { BadRequestException, Injectable } from '@nestjs/common';
import { CreateUserDto, ListUsersByClientDto, UpdateUserDto } from './dtos/index.js';
import { User } from './entities/user.entity.js';
import { Brackets, Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { asyncHandler } from '../common/helpers/async-handler.js';
import { PaginationDto } from '../common/dto/pagination.dto.js';
import { ValidRoles } from '../auth/interfaces/index.js';
import { AuditLogService } from '../common/services/audit-log.service.js';

@Injectable()
export class UserService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly auditLogService: AuditLogService,
  ) {}

  create = asyncHandler(async (createUserDto: CreateUserDto) => {
    const { client_id, ...userData } = createUserDto;

    const existingUser = await this.userRepository.findOne({
      where: { email: userData.email },
    });

    if (existingUser) {
      throw new BadRequestException(
        `User with email ${userData.email} already exists`,
      );
    }

    const user = this.userRepository.create({
      ...userData,
      role: (userData.role as ValidRoles) || ValidRoles.user,
      client: client_id ? ({ id: client_id } as User) : null,
    });

    await this.userRepository.save(user);
    delete user.password;
    await this.auditLogService.recordDomainEvent({
      statusCode: 201,
      outcome: 'success',
      eventType: 'user.created',
      userId: user.id,
      userRole: user.role,
      message: 'User created successfully',
      metadata: {
        email: user.email,
        clientId: client_id ?? null,
      },
    });

    return user;
  });

  findAll = asyncHandler(async (paginationDto: PaginationDto) => {
    const { limit = 1000, offset = 0, isActive = true } = paginationDto;
    const all = paginationDto.all;

    const query = this.userRepository
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.client', 'client')
      .loadRelationCountAndMap('user.quantity_users', 'user.users');

    if (!all) {
      query.where('user.isActive = :isActive', { isActive });
    }

    return await query.skip(offset).take(limit).getMany();
  });

  findOneById = asyncHandler(async (id: string) => {
    const user = await this.userRepository.findOneBy({ id: id });

    if (!user) {
      throw new BadRequestException(`User with id ${id} not found`);
    }
    return user;
  });

  byClient = asyncHandler(async (data: ListUsersByClientDto) => {
    const { user_id } = data;

    return this.userRepository.find({
      where: {
        client: { id: user_id },
      },
      relations: ['client'],
    });
  });

  search = asyncHandler(async (key: { key: string }) => {
    const word = key.key;
    return this.userRepository
      .createQueryBuilder('user')
      .where(
        new Brackets((qb) => {
          qb.where('user.email ILIKE :word', { word: `%${word}%` })
            .orWhere(
              "CONCAT(user.first_name, ' ', COALESCE(user.last_name, '')) ILIKE :word",
              { word: `%${word}%` },
            )
            .orWhere('user.role::text ILIKE :word', { word: `%${word}%` });
        }),
      )
      .getMany();
  });

  findOneByEmail = asyncHandler(async (email: string) => {
    const user = await this.userRepository.findOne({
      where: { email: email.toLocaleLowerCase() },
      relations: {
        client: true,
      },
      select: {
        email: true,
        password: true,
        id: true,
        isActive: true,
        is_two_factor_enabled: true,
        role: true,
        client: { id: true },
        mustChangePassword: true,
      },
    });

    if (!user) {
      throw new BadRequestException(`User with email ${email} not found`);
    }

    return user;
  });

  update = asyncHandler(async (id: string, updateUserDto: UpdateUserDto) => {
    if (updateUserDto.email) {
      const existingUser = await this.userRepository.findOne({
        where: { email: updateUserDto.email },
      });
      if (existingUser && existingUser.id !== id) {
        throw new BadRequestException(
          `Email ${updateUserDto.email} is already in use`,
        );
      }
    }

    const user = await this.userRepository.preload({
      id: id,
      ...updateUserDto,
      password: updateUserDto.password ?? undefined,
      role: updateUserDto.role as ValidRoles | undefined,
    });

    if (!user) {
      throw new BadRequestException(`User with id ${id} not found`);
    }

    await this.userRepository.save(user);
    delete user.password;
    await this.auditLogService.recordDomainEvent({
      statusCode: 200,
      outcome: 'success',
      eventType: 'user.updated',
      userId: user.id,
      userRole: user.role,
      message: 'User updated successfully',
      metadata: {
        email: user.email,
        updatedFields: Object.keys(updateUserDto),
      },
    });
    return user;
  });

  remove = asyncHandler(async (id: string) => {
    const user = await this.userRepository.findOneBy({ id });
    if (!user) {
      throw new BadRequestException(`User with id ${id} not found`);
    }
    await this.userRepository.update(user.id, { isActive: false });
    await this.auditLogService.recordDomainEvent({
      statusCode: 200,
      outcome: 'warning',
      eventType: 'user.deactivated',
      userId: user.id,
      userRole: user.role,
      message: 'User deactivated successfully',
      metadata: {
        email: user.email,
      },
    });
    return { message: `User with id ${id} has been deleted` };
  });

  findOneWithSecret = asyncHandler(async (id: string) => {
    return this.userRepository.findOne({
      where: { id },
      select: [
        'id',
        'email',
        'role',
        'two_factor_secret',
        'is_two_factor_enabled',
        'is_two_factor_pending',
      ],
    });
  });

  async updatePassword(id: string, password: string) {
    await this.userRepository.update(id, { password });
    await this.auditLogService.recordDomainEvent({
      statusCode: 200,
      outcome: 'success',
      eventType: 'user.password.updated',
      userId: id,
      message: 'User password updated',
    });
  }

  async clearMustChangePassword(id: string) {
    await this.userRepository.update(id, { mustChangePassword: false });
  }
}
