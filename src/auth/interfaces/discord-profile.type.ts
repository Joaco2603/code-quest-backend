export type DiscordProfile = {
  id: string;
  username: string;
  global_name: string | null;
  email: string | null;
  avatar: string | null;
  verified?: boolean;
};

export function namesFromDiscordProfile(
  profile: Pick<DiscordProfile, 'username' | 'global_name'>,
): { first_name: string; last_name: string | null } {
  const displayName = profile.global_name?.trim() || profile.username.trim();
  const parts = displayName.split(/\s+/).filter(Boolean);
  const first_name = (parts[0] ?? 'discord').toLowerCase().slice(0, 70);
  const last_name =
    parts.length > 1
      ? parts.slice(1).join(' ').toLowerCase().slice(0, 70)
      : null;

  return { first_name, last_name };
}
