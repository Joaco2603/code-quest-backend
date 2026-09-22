import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { QueryFailedError } from 'typeorm';
import { UserService } from '../user.service.js';
import { User } from '../entities/user.entity.js';
import { AuditLogService } from '../../common/services/audit-log.service.js';
import { BcryptAdapter } from '../../auth/adapters/bcrypt.adapter.js';
import { ValidRoles } from '../../auth/interfaces/index.js';
import { vi } from 'vitest';

describe('UserService', () => {
  const bcryptAdapter = new BcryptAdapter();
  const auditLogService = {
    recordDomainEvent: vi.fn().mockResolvedValue(undefined),
  };

  const userRepository = {
    findOne: vi.fn(),
    findOneBy: vi.fn(),
    find: vi.fn(),
    create: vi.fn(),
    save: vi.fn(),
    update: vi.fn(),
    createQueryBuilder: vi.fn(),
  };

  const service = new UserService(
    userRepository as never,
    auditLogService as unknown as AuditLogService,
    bcryptAdapter,
  );

  const clientActor = {
    id: 'client-1',
    email: 'client@example.com',
    role: ValidRoles.client,
    is_two_factor_enabled: true,
    is_two_factor_validated: true,
  };

  const adminActor = {
    ...clientActor,
    id: 'admin-1',
    email: 'admin@example.com',
    role: ValidRoles.admin,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    auditLogService.recordDomainEvent.mockResolvedValue(undefined);
  });

  it.each([false, true])(
    'hashes passwords and sets password-change policy (selfRegistered=%s)',
    async (selfRegistered) => {
      userRepository.findOne.mockResolvedValue(null);
      userRepository.create.mockImplementation((data: Partial<User>) => ({
        id: 'user-1',
        role: ValidRoles.user,
        ...data,
      }));
      userRepository.save.mockImplementation(async (user: User) => user);

      const created = await service.create(
        {
          email: 'new@example.com',
          password: 'Password1!',
          first_name: 'New',
          last_name: 'User',
          address: 'Street 123',
        },
        { selfRegistered },
      );

      expect(created).not.toHaveProperty('password', 'Password1!');
      expect(userRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          password: expect.not.stringContaining('Password1!'),
          mustChangePassword: !selfRegistered,
        }),
      );
      const hashed = userRepository.create.mock.calls[0][0].password as string;
      expect(await bcryptAdapter.compareHash('Password1!', hashed)).toBe(true);
    },
  );

  it('rejects a duplicate email without revealing the address', async () => {
    userRepository.findOne.mockResolvedValue({ id: 'existing' });

    await expect(
      service.create({
        email: 'taken@example.com',
        password: 'Password1!',
        first_name: 'New',
        last_name: 'User',
        address: 'Street 123',
      }),
    ).rejects.toThrow(new BadRequestException('Unable to create the account'));
    expect(userRepository.save).not.toHaveBeenCalled();
  });

  it('maps a unique email violation to the same conflict', async () => {
    userRepository.findOne.mockResolvedValue(null);
    userRepository.create.mockImplementation((data: Partial<User>) => ({
      id: 'user-1',
      role: ValidRoles.user,
      ...data,
    }));
    userRepository.save.mockRejectedValue(
      new QueryFailedError('INSERT', [], { code: '23505' } as never),
    );

    await expect(
      service.create({
        email: 'taken@example.com',
        password: 'Password1!',
        first_name: 'New',
        last_name: 'User',
        address: 'Street 123',
      }),
    ).rejects.toThrow(new BadRequestException('Unable to create the account'));
  });

  it('rejects role changes from client users', async () => {
    userRepository.findOne.mockResolvedValue({
      id: 'client-1',
      email: 'client@example.com',
      role: ValidRoles.client,
      client: null,
    });

    await expect(
      service.update('client-1', { role: ValidRoles.admin }, clientActor),
    ).rejects.toThrow(ForbiddenException);
    expect(userRepository.save).not.toHaveBeenCalled();
  });

  it('rejects client updates to users they do not own', async () => {
    userRepository.findOne.mockResolvedValue({
      id: 'other-user',
      email: 'other@example.com',
      role: ValidRoles.user,
      client: { id: 'another-client' },
    });

    await expect(
      service.update('other-user', { first_name: 'hacked' }, clientActor),
    ).rejects.toThrow(ForbiddenException);
  });

  it('allows admins to change roles', async () => {
    const target = {
      id: 'user-2',
      email: 'user@example.com',
      role: ValidRoles.user,
      client: { id: 'client-1' },
    };
    userRepository.findOne.mockResolvedValue(target);
    userRepository.save.mockImplementation(async (user: User) => user);

    const updated = await service.update(
      'user-2',
      { role: ValidRoles.admin },
      adminActor,
    );

    expect(updated.role).toBe(ValidRoles.admin);
  });

  it('hashes passwords on update', async () => {
    const target = {
      id: 'user-2',
      email: 'user@example.com',
      role: ValidRoles.user,
      client: { id: 'client-1' },
      password: 'old-hash',
    };
    userRepository.findOne.mockResolvedValue(target);
    let savedHash: unknown;
    userRepository.save.mockImplementation(async (user: User) => {
      savedHash = (user as User).password;
      return user;
    });

    const updated = await service.update(
      'user-2',
      { password: 'NewPassword1!' },
      adminActor,
    );

    expect(
      await bcryptAdapter.compareHash('NewPassword1!', savedHash as string),
    ).toBe(true);
    expect(updated).not.toHaveProperty('password');
    expect(updated).not.toHaveProperty('two_factor_secret');
  });

  it('creates Discord users without a password', async () => {
    userRepository.findOne.mockResolvedValue(null);
    userRepository.create.mockImplementation((data: Partial<User>) => ({
      id: 'discord-user',
      role: ValidRoles.user,
      ...data,
    }));
    userRepository.save.mockImplementation(async (user: User) => user);

    const created = await service.createFromDiscord({
      email: 'student@example.com',
      discordId: 'discord-123',
      first_name: 'student',
      last_name: 'dev',
    });

    expect(created.password).toBeNull();
    expect(created.mustChangePassword).toBe(false);
    expect(created.discordId).toBe('discord-123');
    expect(userRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        password: null,
        role: ValidRoles.user,
        mustChangePassword: false,
      }),
    );
  });

  it('rejects linking a Discord account that already belongs to someone else', async () => {
    userRepository.findOne.mockResolvedValue({
      id: 'other-user',
      discordId: 'discord-123',
    });

    await expect(
      service.linkDiscordAccount('user-1', 'discord-123'),
    ).rejects.toThrow('Discord account is already linked');
    expect(userRepository.update).not.toHaveBeenCalled();
  });

  it.each([3, 0])(
    'preserves pagination and maps child count %i',
    async (childCount) => {
      const row = {
        id: 'user-1',
        email: 'user@example.com',
        role: ValidRoles.user,
      };
      const builder = {
        leftJoinAndSelect: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        andWhere: vi.fn().mockReturnThis(),
        skip: vi.fn().mockReturnThis(),
        take: vi.fn().mockReturnThis(),
        getManyAndCount: vi.fn().mockResolvedValue([[row], 42]),
      };
      const counts = {
        select: vi.fn().mockReturnThis(),
        addSelect: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        groupBy: vi.fn().mockReturnThis(),
        getRawMany: vi
          .fn()
          .mockResolvedValue(
            childCount
              ? [{ clientId: 'user-1', count: String(childCount) }]
              : [],
          ),
      };
      userRepository.createQueryBuilder = vi
        .fn()
        .mockReturnValueOnce(builder)
        .mockReturnValueOnce(counts);

      const result = await service.findAll({ limit: 1, offset: 0 }, adminActor);
      expect(result.items[0].quantity_users).toBe(childCount);
      expect(counts.where).toHaveBeenCalledWith(
        'child.client_id IN (:...ids)',
        {
          ids: ['user-1'],
        },
      );

      expect(userRepository.createQueryBuilder).toHaveBeenCalledWith('user');
      expect(builder.skip).toHaveBeenCalledWith(0);
      expect(builder.take).toHaveBeenCalledWith(1);
      expect(result).toEqual({ items: [row], total: 42, limit: 1, offset: 0 });
    },
  );

  it('derives offset from page and pageSize when paginating by page', async () => {
    const builder = {
      leftJoinAndSelect: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      andWhere: vi.fn().mockReturnThis(),
      skip: vi.fn().mockReturnThis(),
      take: vi.fn().mockReturnThis(),
      getManyAndCount: vi.fn().mockResolvedValue([[], 50]),
    };
    userRepository.createQueryBuilder = vi.fn().mockReturnValue(builder);

    const result = await service.findAll(
      { page: 3, pageSize: 10, limit: 1, offset: 0 },
      adminActor,
    );

    // Explicit limit always wins over pageSize, on every page.
    expect(builder.skip).toHaveBeenCalledWith(2);
    expect(builder.take).toHaveBeenCalledWith(1);
    expect(result).toEqual({ items: [], total: 50, limit: 1, offset: 2 });
  });

  it('keeps one limit precedence on page 1 and page 2 when both params are present', async () => {
    const buildBuilder = () => ({
      leftJoinAndSelect: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      andWhere: vi.fn().mockReturnThis(),
      skip: vi.fn().mockReturnThis(),
      take: vi.fn().mockReturnThis(),
      getManyAndCount: vi.fn().mockResolvedValue([[], 11]),
    });
    const first = buildBuilder();
    const second = buildBuilder();
    userRepository.createQueryBuilder = vi
      .fn()
      .mockReturnValueOnce(first)
      .mockReturnValueOnce(second);

    const page1 = await service.findAll(
      { page: 1, pageSize: 10, limit: 1, offset: 0 },
      adminActor,
    );
    const page2 = await service.findAll(
      { page: 2, pageSize: 10, limit: 1, offset: 0 },
      adminActor,
    );

    expect(first.take).toHaveBeenCalledWith(1);
    expect(first.skip).toHaveBeenCalledWith(0);
    expect(second.take).toHaveBeenCalledWith(1);
    expect(second.skip).toHaveBeenCalledWith(1);
    expect(page1).toEqual({ items: [], total: 11, limit: 1, offset: 0 });
    expect(page2).toEqual({ items: [], total: 11, limit: 1, offset: 1 });
  });

  it('uses pageSize as the limit when no explicit limit is given', async () => {
    const buildBuilder = () => ({
      leftJoinAndSelect: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      andWhere: vi.fn().mockReturnThis(),
      skip: vi.fn().mockReturnThis(),
      take: vi.fn().mockReturnThis(),
      getManyAndCount: vi.fn().mockResolvedValue([[], 25]),
    });
    const first = buildBuilder();
    const second = buildBuilder();
    userRepository.createQueryBuilder = vi
      .fn()
      .mockReturnValueOnce(first)
      .mockReturnValueOnce(second);

    const page1 = await service.findAll({ page: 1, pageSize: 10 }, adminActor);
    const page2 = await service.findAll({ page: 2, pageSize: 10 }, adminActor);

    expect(first.take).toHaveBeenCalledWith(10);
    expect(first.skip).toHaveBeenCalledWith(0);
    expect(second.take).toHaveBeenCalledWith(10);
    expect(second.skip).toHaveBeenCalledWith(10);
    expect(page1).toEqual({ items: [], total: 25, limit: 10, offset: 0 });
    expect(page2).toEqual({ items: [], total: 25, limit: 10, offset: 10 });
  });

  it('caps an omitted limit at the DTO maximum of 100', async () => {
    const builder = {
      leftJoinAndSelect: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      andWhere: vi.fn().mockReturnThis(),
      skip: vi.fn().mockReturnThis(),
      take: vi.fn().mockReturnThis(),
      getManyAndCount: vi.fn().mockResolvedValue([[], 0]),
    };
    userRepository.createQueryBuilder = vi.fn().mockReturnValue(builder);

    const result = await service.findAll({}, adminActor);

    expect(builder.take).toHaveBeenCalledWith(100);
    expect(result).toEqual({ items: [], total: 0, limit: 100, offset: 0 });
  });

  it('rejects a page that disagrees with an explicit offset', async () => {
    await expect(
      service.findAll({ page: 2, limit: 5, offset: 30 }, adminActor),
    ).rejects.toThrow(BadRequestException);
  });

  it('returns 404 (not 400) for missing ids on findOneById, update and remove', async () => {
    userRepository.findOne.mockResolvedValue(null);
    userRepository.findOneBy.mockResolvedValue(null);

    await expect(service.findOneById('missing-id')).rejects.toThrow(
      NotFoundException,
    );
    await expect(
      service.update('missing-id', { first_name: 'x' }, adminActor),
    ).rejects.toThrow(NotFoundException);
    await expect(service.remove('missing-id')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('scopes client listing to owned users only', async () => {
    const builder = {
      leftJoinAndSelect: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      andWhere: vi.fn().mockReturnThis(),
      skip: vi.fn().mockReturnThis(),
      take: vi.fn().mockReturnThis(),
      getManyAndCount: vi.fn().mockResolvedValue([[], 0]),
    };
    userRepository.createQueryBuilder = vi.fn().mockReturnValue(builder);

    await service.findAll({ limit: 10, offset: 0 }, clientActor);

    expect(builder.andWhere).toHaveBeenCalledWith(
      '(user.id = :actorId OR client.id = :actorId)',
      { actorId: 'client-1' },
    );
  });

  it('applies the client actor scope to search results', async () => {
    const rows = [{ id: 'user-1', email: 'user@example.com' }];
    const builder = {
      leftJoinAndSelect: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      andWhere: vi.fn().mockReturnThis(),
      getMany: vi.fn().mockResolvedValue(rows),
    };
    userRepository.createQueryBuilder = vi.fn().mockReturnValue(builder);

    const result = await service.search({ key: 'user' }, clientActor);

    expect(builder.andWhere).toHaveBeenCalledWith(
      '(user.id = :actorId OR client.id = :actorId)',
      { actorId: 'client-1' },
    );
    expect(result).toEqual(rows);
  });

  it('lets clients list only their own users through byClient', async () => {
    userRepository.find.mockResolvedValue([]);

    await service.byClient({ user_id: 'client-1' }, clientActor);

    expect(userRepository.find).toHaveBeenCalledWith({
      where: { client: { id: 'client-1' } },
      relations: { client: true },
    });
  });

  it('rejects clients listing users of another client', async () => {
    await expect(
      service.byClient({ user_id: 'another-client' }, clientActor),
    ).rejects.toThrow(ForbiddenException);
    expect(userRepository.find).not.toHaveBeenCalled();
  });

  it('lets admins list users of any client through byClient', async () => {
    userRepository.find.mockResolvedValue([]);

    await service.byClient({ user_id: 'some-client' }, adminActor);

    expect(userRepository.find).toHaveBeenCalledWith({
      where: { client: { id: 'some-client' } },
      relations: { client: true },
    });
  });

  it('soft-deactivates users and returns the raw result without a data envelope', async () => {
    const target = {
      id: 'user-9',
      email: 'gone@example.com',
      role: ValidRoles.user,
    };
    userRepository.findOneBy.mockResolvedValue(target);
    userRepository.update.mockResolvedValue(undefined);

    const result = await service.remove('user-9');

    expect(userRepository.update).toHaveBeenCalledWith('user-9', {
      isActive: false,
    });
    expect(result).toEqual({
      message: 'User with id user-9 has been deleted',
      id: 'user-9',
    });
    expect(result).not.toHaveProperty('data');
  });
});
