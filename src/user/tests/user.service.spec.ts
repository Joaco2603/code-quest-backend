import { ForbiddenException } from '@nestjs/common';
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

  it('hashes passwords on create', async () => {
    userRepository.findOne.mockResolvedValue(null);
    userRepository.create.mockImplementation((data: Partial<User>) => ({
      id: 'user-1',
      role: ValidRoles.user,
      ...data,
    }));
    userRepository.save.mockImplementation(async (user: User) => user);

    const created = await service.create({
      email: 'new@example.com',
      password: 'Password1!',
      first_name: 'New',
      last_name: 'User',
      address: 'Street 123',
    });

    expect(created).not.toHaveProperty('password', 'Password1!');
    expect(userRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        password: expect.not.stringContaining('Password1!'),
      }),
    );
    const hashed = userRepository.create.mock.calls[0][0].password as string;
    expect(await bcryptAdapter.compareHash('Password1!', hashed)).toBe(true);
  });

  it('rejects role changes from client users', async () => {
    userRepository.findOne.mockResolvedValue({
      id: 'client-1',
      email: 'client@example.com',
      role: ValidRoles.client,
      client: null,
    });

    await expect(
      service.update(
        'client-1',
        { role: ValidRoles.admin },
        clientActor,
      ),
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

    expect(await bcryptAdapter.compareHash('NewPassword1!', savedHash as string)).toBe(
      true,
    );
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

  it('returns paginated items with the real total, not the page size', async () => {
    const row = {
      id: 'user-1',
      email: 'user@example.com',
      role: ValidRoles.user,
    };
    const builder = {
      leftJoinAndSelect: vi.fn().mockReturnThis(),
      loadRelationCountAndMap: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      andWhere: vi.fn().mockReturnThis(),
      skip: vi.fn().mockReturnThis(),
      take: vi.fn().mockReturnThis(),
      getManyAndCount: vi.fn().mockResolvedValue([[row], 42]),
    };
    userRepository.createQueryBuilder = vi.fn().mockReturnValue(builder);

    const result = await service.findAll({ limit: 1, offset: 0 }, adminActor);

    expect(userRepository.createQueryBuilder).toHaveBeenCalledWith('user');
    expect(builder.skip).toHaveBeenCalledWith(0);
    expect(builder.take).toHaveBeenCalledWith(1);
    expect(result).toEqual({ items: [row], total: 42, limit: 1, offset: 0 });
  });

  it('derives offset from page and pageSize when paginating by page', async () => {
    const builder = {
      leftJoinAndSelect: vi.fn().mockReturnThis(),
      loadRelationCountAndMap: vi.fn().mockReturnThis(),
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

    expect(builder.skip).toHaveBeenCalledWith(20);
    expect(builder.take).toHaveBeenCalledWith(10);
    expect(result).toEqual({ items: [], total: 50, limit: 10, offset: 20 });
  });

  it('scopes client listing to owned users only', async () => {
    const builder = {
      leftJoinAndSelect: vi.fn().mockReturnThis(),
      loadRelationCountAndMap: vi.fn().mockReturnThis(),
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
      relations: ['client'],
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
      relations: ['client'],
    });
  });
});
