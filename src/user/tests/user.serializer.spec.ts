import { ValidRoles } from '../../auth/interfaces/index.js';
import { User } from '../entities/user.entity.js';
import {
  serializeClientSummary,
  serializeUserDetail,
  serializeUserListItem,
  serializeUserDetails,
} from '../serializers/user.serializer.js';

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

describe('user serializers', () => {
  it('maps snake_case columns to camelCase output fields', () => {
    const detail = serializeUserDetail(buildUser());

    expect(detail).toEqual({
      id: '43566ec8-22af-41d3-933a-918b536fe99f',
      email: 'user@example.com',
      discordId: null,
      firstName: 'kevin',
      lastName: 'diaz',
      address: 'Code Quest main campus',
      role: ValidRoles.user,
      isActive: true,
      isTwoFactorEnabled: false,
      isTwoFactorPending: false,
      mustChangePassword: true,
      client: null,
    });
  });

  it('excludes password and two_factor_secret even when present', () => {
    const source = buildUser({
      password: 'hashed-secret',
      two_factor_secret: 'totp-secret',
    } as Partial<User>);

    const detail = serializeUserDetail(source);

    expect(detail).not.toHaveProperty('password');
    expect(detail).not.toHaveProperty('two_factor_secret');
    expect(detail).not.toHaveProperty('twoFactorSecret');
    expect(JSON.stringify(detail)).not.toContain('hashed-secret');
    expect(JSON.stringify(detail)).not.toContain('totp-secret');
  });

  it('ignores unknown extra properties on the source object', () => {
    const source = Object.assign(buildUser(), {
      leakedInternalFlag: true,
      password: 'hashed-secret',
    });

    const detail = serializeUserDetail(source);

    expect(detail).not.toHaveProperty('leakedInternalFlag');
    expect(Object.keys(detail).sort()).toEqual(
      [
        'id',
        'email',
        'discordId',
        'firstName',
        'lastName',
        'address',
        'role',
        'isActive',
        'isTwoFactorEnabled',
        'isTwoFactorPending',
        'mustChangePassword',
        'client',
      ].sort(),
    );
  });

  it('serializes nested client with limited depth and no secrets', () => {
    const client = buildUser({
      id: 'client-1',
      email: 'client@example.com',
      password: 'client-hash',
      two_factor_secret: 'client-totp',
    } as Partial<User>);
    client.client = buildUser({ id: 'grandparent' });

    const detail = serializeUserDetail(buildUser({ client }));

    expect(detail.client).toEqual({
      id: 'client-1',
      email: 'client@example.com',
      firstName: 'kevin',
      lastName: 'diaz',
      role: ValidRoles.user,
      isActive: true,
    });
    expect(detail.client).not.toHaveProperty('client');
    expect(detail.client).not.toHaveProperty('password');
    expect(JSON.stringify(detail.client)).not.toContain('client-hash');
  });

  it('maps absent nullable fields to null', () => {
    const source = buildUser();
    source.discordId = undefined as unknown as null;
    source.last_name = undefined as unknown as null;
    source.address = undefined as unknown as string;

    const detail = serializeUserDetail(source);

    expect(detail.discordId).toBeNull();
    expect(detail.lastName).toBeNull();
    expect(detail.address).toBeNull();
    expect(detail.client).toBeNull();
  });

  it('includes the real quantityUsers count only on list items', () => {
    const withCount = Object.assign(buildUser(), { quantity_users: 3 });
    const item = serializeUserListItem(withCount);

    expect(item.quantityUsers).toBe(3);
    expect(serializeUserDetail(buildUser())).not.toHaveProperty(
      'quantityUsers',
    );
    expect(serializeClientSummary(buildUser())).not.toHaveProperty(
      'quantityUsers',
    );
  });

  it('defaults quantityUsers to zero when the count is missing', () => {
    expect(serializeUserListItem(buildUser()).quantityUsers).toBe(0);
  });

  it('exposes exactly the detail fields plus quantityUsers on list items', () => {
    const withCount = Object.assign(buildUser(), { quantity_users: '2' });
    const item = serializeUserListItem(withCount);

    expect(item.quantityUsers).toBe(2);
    expect(Object.keys(item).sort()).toEqual(
      [
        'id',
        'email',
        'discordId',
        'firstName',
        'lastName',
        'address',
        'role',
        'isActive',
        'isTwoFactorEnabled',
        'isTwoFactorPending',
        'mustChangePassword',
        'client',
        'quantityUsers',
      ].sort(),
    );
  });

  it('serializes collections without leaking secrets', () => {
    const users = [
      buildUser(),
      buildUser({
        id: 'second-id',
        email: 'second@example.com',
        password: 'hash-2',
      } as Partial<User>),
    ];

    const details = serializeUserDetails(users);

    expect(details).toHaveLength(2);
    expect(details[1].id).toBe('second-id');
    expect(JSON.stringify(details)).not.toContain('hash-2');
  });
});
