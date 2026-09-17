export type DiscordLoginTicketPayload = {
  purpose: 'discord_login';
  sub: string;
  jti?: string;
};
