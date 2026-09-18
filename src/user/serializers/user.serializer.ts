import type { User } from '../entities/user.entity.js';
import type {
  UserClientSummaryDto,
  UserDetailResponseDto,
  UserListItemResponseDto,
} from '../dtos/user-response.dto.js';

type UserWithCount = User & { quantity_users?: unknown };

/**
 * Explicit user serializers: pick every public field by hand.
 * Never spread entities and never read `password` or `two_factor_secret`,
 * so those secrets stay out even when present on the source object or on
 * a nested relation. Snake_case columns map to camelCase output here.
 */
export function serializeClientSummary(
  client: User | null | undefined,
): UserClientSummaryDto | null {
  if (!client) {
    return null;
  }

  return {
    id: client.id,
    email: client.email,
    firstName: client.first_name,
    lastName: client.last_name ?? null,
    role: client.role,
    isActive: client.isActive,
  };
}

export function serializeUserDetail(source: User): UserDetailResponseDto {
  return {
    id: source.id,
    email: source.email,
    discordId: source.discordId ?? null,
    firstName: source.first_name,
    lastName: source.last_name ?? null,
    address: source.address ?? null,
    role: source.role,
    isActive: source.isActive,
    isTwoFactorEnabled: source.is_two_factor_enabled,
    isTwoFactorPending: source.is_two_factor_pending,
    mustChangePassword: source.mustChangePassword,
    client: serializeClientSummary(source.client),
  };
}

export function serializeUserListItem(
  source: UserWithCount,
): UserListItemResponseDto {
  const detail = serializeUserDetail(source);
  const raw = source.quantity_users;
  const parsed = typeof raw === 'number' ? raw : Number(raw ?? 0);

  return {
    id: detail.id,
    email: detail.email,
    discordId: detail.discordId,
    firstName: detail.firstName,
    lastName: detail.lastName,
    address: detail.address,
    role: detail.role,
    isActive: detail.isActive,
    isTwoFactorEnabled: detail.isTwoFactorEnabled,
    isTwoFactorPending: detail.isTwoFactorPending,
    mustChangePassword: detail.mustChangePassword,
    client: detail.client,
    quantityUsers: Number.isFinite(parsed) ? parsed : 0,
  };
}

export function serializeUserDetails(sources: User[]): UserDetailResponseDto[] {
  return sources.map((source) => serializeUserDetail(source));
}

export function serializeUserListItems(
  sources: UserWithCount[],
): UserListItemResponseDto[] {
  return sources.map((source) => serializeUserListItem(source));
}
