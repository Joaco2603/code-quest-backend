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
    create: vi.fn(),
    save: vi.fn(),
    update: vi.fn(),
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
    userRepository.save.mockImplementation(async (user: User) => user);

    await service.update('user-2', { password: 'NewPassword1!' }, adminActor);

    expect(await bcryptAdapter.compareHash('NewPassword1!', target.password)).toBe(
      true,
    );
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
});
