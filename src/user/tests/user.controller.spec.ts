import { ValidRoles } from '../../auth/interfaces/index.js';
import { User } from '../entities/user.entity.js';
import { UserController } from '../user.controller.js';
import { UserService } from '../user.service.js';
import { vi } from 'vitest';

function buildUser(overrides: Partial<User> = {}): User {
  const user = new User();
  user.id = '43566ec8-22af-41d3-933a-918b536fe99f';
  user.email = 'user@example.com';
  user.discordId = null;
  user.first_name = 'kevin';
  user.last_name = 'diaz';
  user.address = 'Code Quest main campus';
  user.isActive = true;
  user.role = ValidRoles.user;
  user.client = null;
  user.is_two_factor_enabled = false;
  user.is_two_factor_pending = false;
  user.mustChangePassword = true;
  return Object.assign(user, overrides);
}

describe('UserController response contracts', () => {
  const adminActor = {
    id: 'admin-1',
    email: 'admin@example.com',
    role: ValidRoles.admin,
    is_two_factor_enabled: true,
    is_two_factor_validated: true,
  };

  const userService = {
    create: vi.fn(),
    findAll: vi.fn(),
    findOneById: vi.fn(),
    search: vi.fn(),
    byClient: vi.fn(),
    update: vi.fn(),
  };
  const controller = new UserController(userService as unknown as UserService);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('wraps creation in a single data envelope with camelCase fields', async () => {
    userService.create.mockResolvedValue(
      buildUser({ password: undefined } as Partial<User>),
    );

    const response = await controller.createAdmin(adminActor, {
      email: 'user@example.com',
      password: 'Password1!',
      first_name: 'kevin',
      last_name: 'diaz',
      address: 'Code Quest main campus',
    });

    expect(Object.keys(response)).toEqual(['data']);
    expect(response.data).toMatchObject({
      id: '43566ec8-22af-41d3-933a-918b536fe99f',
      firstName: 'kevin',
      lastName: 'diaz',
    });
    expect(response).not.toHaveProperty('data.data');
    expect(JSON.stringify(response)).not.toContain('password');
  });

  it('wraps paginated lists as data plus meta with the real total', async () => {
    const items = [
      Object.assign(buildUser(), { quantity_users: 2 }),
      Object.assign(buildUser({ id: 'second', email: 'b@example.com' }), {
        quantity_users: 0,
      }),
    ];
    userService.findAll.mockResolvedValue({
      items,
      total: 42,
      limit: 2,
      offset: 0,
    });

    const response = await controller.findAll(adminActor, {
      limit: 2,
      offset: 0,
    });

    expect(Object.keys(response).sort()).toEqual(['data', 'meta']);
    expect(response.meta).toEqual({ total: 42, limit: 2, offset: 0 });
    expect(response.data).toHaveLength(2);
    expect(response.data[0]).toHaveProperty('quantityUsers', 2);
    expect(response.data[0]).toHaveProperty('firstName', 'kevin');
    expect(response).not.toHaveProperty('data.data');
  });

  it('keeps an empty page as an empty array with its total', async () => {
    userService.findAll.mockResolvedValue({
      items: [],
      total: 5,
      limit: 20,
      offset: 40,
    });

    const response = await controller.findAll(adminActor, {
      limit: 20,
      offset: 40,
    });

    expect(response.data).toEqual([]);
    expect(response.meta).toEqual({ total: 5, limit: 20, offset: 40 });
  });

  it('wraps detail, search, byClient and update without nested data', async () => {
    userService.findOneById.mockResolvedValue(buildUser());
    userService.search.mockResolvedValue([buildUser()]);
    userService.byClient.mockResolvedValue([buildUser()]);
    userService.update.mockResolvedValue(buildUser());

    const detail = await controller.findOneById(adminActor, buildUser().id);
    const search = await controller.search(adminActor, { key: 'kev' });
    const byClient = await controller.byClient(adminActor, {
      user_id: 'client-1',
    });
    const updated = await controller.update(adminActor, buildUser().id, {
      first_name: 'kevin',
    });

    for (const response of [detail, search, byClient, updated]) {
      expect(Object.keys(response)).toEqual(['data']);
      expect(response).not.toHaveProperty('data.data');
      expect(response).not.toHaveProperty('meta');
    }
    expect(Array.isArray(search.data)).toBe(true);
    expect(Array.isArray(byClient.data)).toBe(true);
    expect(search.data[0]).not.toHaveProperty('quantityUsers');
    expect(byClient.data[0]).not.toHaveProperty('quantityUsers');
  });
});
