import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import {
  CreateUserDto,
  ListUsersByClientDto,
  UpdateUserDto,
} from './dtos/index.js';
import { User } from './entities/user.entity.js';
import { Brackets, Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { asyncHandler } from '../common/helpers/async-handler.js';
import { PaginationDto } from '../common/dto/pagination.dto.js';
import { AuthUser, ValidRoles } from '../auth/interfaces/index.js';
import { AuditLogService } from '../common/services/audit-log.service.js';
import { BcryptAdapter } from '../auth/adapters/bcrypt.adapter.js';

type TwoFactorState = {
  two_factor_secret?: string | null;
  is_two_factor_enabled?: boolean;
  is_two_factor_pending?: boolean;
};

@Injectable()
export class UserService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly auditLogService: AuditLogService,
    private readonly bcryptAdapter: BcryptAdapter,
  ) {}

  create = asyncHandler(async (createUserDto: CreateUserDto) => {
    const { client_id, password, ...userData } = createUserDto;

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
      password: await this.hashPassword(password),
      role: (userData.role as ValidRoles) || ValidRoles.user,
      client: client_id ? ({ id: client_id } as User) : null,
    });

    await this.userRepository.save(user);
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

    return this.toPublicUser(user);
  });

  findAll = asyncHandler(
    async (paginationDto: PaginationDto, actor: AuthUser) => {
      const { limit = 1000, offset = 0, isActive = true } = paginationDto;
      const all = paginationDto.all;

      const query = this.userRepository
        .createQueryBuilder('user')
        .leftJoinAndSelect('user.client', 'client')
        .loadRelationCountAndMap('user.quantity_users', 'user.users');

      if (!all) {
        query.where('user.isActive = :isActive', { isActive });
      }

      this.applyActorScope(query, actor);

      return await query.skip(offset).take(limit).getMany();
    },
  );

  findOneById = asyncHandler(async (id: string, actor?: AuthUser) => {
    const user = await this.userRepository.findOne({
      where: { id },
      relations: { client: true },
    });

    if (!user) {
      throw new BadRequestException(`User with id ${id} not found`);
    }

    if (actor) {
      this.assertCanAccessUser(actor, user);
    }

    return user;
  });

  byClient = asyncHandler(
    async (data: ListUsersByClientDto, actor: AuthUser) => {
      const clientId =
        actor.role === ValidRoles.admin ? data.user_id : actor.id;

      if (actor.role === ValidRoles.client && data.user_id !== actor.id) {
        throw new ForbiddenException(
          'Clients can only list users that belong to them',
        );
      }

      return this.userRepository.find({
        where: {
          client: { id: clientId },
        },
        relations: ['client'],
      });
    },
  );

  search = asyncHandler(async (key: { key: string }, actor: AuthUser) => {
    const word = key.key;
    const query = this.userRepository
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.client', 'client')
      .where(
        new Brackets((qb) => {
          qb.where('user.email ILIKE :word', { word: `%${word}%` })
            .orWhere(
              "CONCAT(user.first_name, ' ', COALESCE(user.last_name, '')) ILIKE :word",
              { word: `%${word}%` },
            )
            .orWhere('user.role::text ILIKE :word', { word: `%${word}%` });
        }),
      );

    this.applyActorScope(query, actor);

    return query.getMany();
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
        discordId: true,
      },
    });

    if (!user) {
      throw new BadRequestException(`User with email ${email} not found`);
    }

    return user;
  });

  async findOneByEmailOptional(
    email: string,
    options?: { withPassword?: boolean },
  ): Promise<User | null> {
    return this.userRepository.findOne({
      where: { email: email.toLowerCase() },
      relations: { client: true },
      ...(options?.withPassword
        ? {
            select: {
              email: true,
              password: true,
              id: true,
              isActive: true,
              is_two_factor_enabled: true,
              role: true,
              client: { id: true },
              mustChangePassword: true,
              discordId: true,
            },
          }
        : {}),
    });
  }

  async findOneByDiscordId(discordId: string): Promise<User | null> {
    return this.userRepository.findOne({
      where: { discordId },
      relations: { client: true },
    });
  }

  async createFromDiscord(data: {
    email: string;
    discordId: string;
    first_name: string;
    last_name: string | null;
  }): Promise<User> {
    const existingUser = await this.userRepository.findOne({
      where: { email: data.email },
    });

    if (existingUser) {
      throw new BadRequestException(
        `User with email ${data.email} already exists`,
      );
    }

    const user = this.userRepository.create({
      email: data.email,
      discordId: data.discordId,
      first_name: data.first_name,
      last_name: data.last_name,
      password: null,
      role: ValidRoles.user,
      mustChangePassword: false,
      is_two_factor_enabled: false,
      isActive: true,
    });

    await this.userRepository.save(user);
    await this.auditLogService.recordDomainEvent({
      statusCode: 201,
      outcome: 'success',
      eventType: 'user.created',
      userId: user.id,
      userRole: user.role,
      message: 'User created from Discord',
      metadata: {
        email: user.email,
        provider: 'discord',
        discordId: data.discordId,
      },
    });

    return user;
  }

  async linkDiscordAccount(userId: string, discordId: string) {
    const existing = await this.findOneByDiscordId(discordId);
    if (existing && existing.id !== userId) {
      throw new ConflictException('Discord account is already linked');
    }

    await this.userRepository.update(userId, { discordId });
    await this.auditLogService.recordDomainEvent({
      statusCode: 200,
      outcome: 'success',
      eventType: 'auth.discord.linked',
      userId,
      message: 'Discord account linked',
      metadata: { discordId },
    });
  }

  update = asyncHandler(
    async (id: string, updateUserDto: UpdateUserDto, actor: AuthUser) => {
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

      const user = await this.userRepository.findOne({
        where: { id },
        relations: { client: true },
      });

      if (!user) {
        throw new BadRequestException(`User with id ${id} not found`);
      }

      this.assertCanAccessUser(actor, user);

      const { role, password, client_id, ...profile } = updateUserDto;

      Object.assign(user, profile);

      if (password) {
        user.password = await this.hashPassword(password);
      }

      if (actor.role === ValidRoles.admin) {
        if (role) {
          user.role = role as ValidRoles;
        }
        if (client_id !== undefined) {
          user.client = client_id ? ({ id: client_id } as User) : null;
        }
      } else if (role !== undefined || client_id !== undefined) {
        throw new ForbiddenException(
          'Only administrators can change user roles or ownership',
        );
      }

      await this.userRepository.save(user);
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
      return this.toPublicUser(user);
    },
  );

  async updateTwoFactorState(id: string, state: TwoFactorState) {
    await this.userRepository.update(id, state);
  }

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
    await this.userRepository.update(id, {
      password: await this.hashPassword(password),
    });
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

  private hashPassword(password: string) {
    return this.bcryptAdapter.hashing(password, 10);
  }

  private toPublicUser(user: User) {
    const { password: _password, two_factor_secret: _secret, ...publicUser } =
      user;
    return publicUser;
  }

  private assertCanAccessUser(actor: AuthUser, target: User) {
    if (actor.role === ValidRoles.admin) {
      return;
    }

    if (actor.role === ValidRoles.client) {
      const ownsTarget = target.client?.id === actor.id;
      if (target.id === actor.id || ownsTarget) {
        return;
      }
    }

    throw new ForbiddenException(
      'You can only manage users that belong to you',
    );
  }

  private applyActorScope(
    query: ReturnType<Repository<User>['createQueryBuilder']>,
    actor: AuthUser,
  ) {
    if (actor.role === ValidRoles.admin) {
      return;
    }

    if (actor.role === ValidRoles.client) {
      query.andWhere('(user.id = :actorId OR client.id = :actorId)', {
        actorId: actor.id,
      });
      return;
    }

    query.andWhere('user.id = :actorId', { actorId: actor.id });
  }
}
