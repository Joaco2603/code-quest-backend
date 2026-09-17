import {
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { DiscordProfile } from '../interfaces/discord-profile.type.js';

const DISCORD_AUTHORIZE_URL = 'https://discord.com/oauth2/authorize';
const DISCORD_TOKEN_URL = 'https://discord.com/api/v10/oauth2/token';
const DISCORD_USER_URL = 'https://discord.com/api/v10/users/@me';
const DISCORD_SCOPES = 'identify email';
const DISCORD_USER_AGENT = 'code-quest/0.0.1';
const DISCORD_TIMEOUT_MS = 10_000;

type DiscordConfig = {
  clientId: string;
  clientSecret: string;
  callbackUrl: string;
};

type DiscordTokenResponse = {
  access_token?: string;
};

type DiscordApiUser = {
  id?: string;
  username?: string;
  global_name?: string | null;
  email?: string | null;
  avatar?: string | null;
  verified?: boolean;
};

@Injectable()
export class DiscordAdapter {
  constructor(private readonly configService: ConfigService) {}

  buildAuthorizeUrl(state: string, codeChallenge: string): string {
    const { clientId, callbackUrl } = this.getConfig();
    const url = new URL(DISCORD_AUTHORIZE_URL);
    url.searchParams.set('client_id', clientId);
    url.searchParams.set('redirect_uri', callbackUrl);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', DISCORD_SCOPES);
    url.searchParams.set('state', state);
    url.searchParams.set('code_challenge', codeChallenge);
    url.searchParams.set('code_challenge_method', 'S256');
    return url.toString();
  }

  async authenticate(
    code: string,
    codeVerifier: string,
  ): Promise<DiscordProfile> {
    const accessToken = await this.exchangeCode(code, codeVerifier);
    return this.fetchProfile(accessToken);
  }

  private getConfig(): DiscordConfig {
    const clientId = this.configService.get<string>(
      'app.auth.discord.clientId',
    );
    const clientSecret = this.configService.get<string>(
      'app.auth.discord.clientSecret',
    );
    const callbackUrl = this.configService.get<string>(
      'app.auth.discord.callbackUrl',
    );

    if (!clientId || !clientSecret || !callbackUrl) {
      throw new ServiceUnavailableException('Discord login is not configured');
    }

    return { clientId, clientSecret, callbackUrl };
  }

  private async exchangeCode(
    code: string,
    codeVerifier: string,
  ): Promise<string> {
    const { clientId, clientSecret, callbackUrl } = this.getConfig();
    const body = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'authorization_code',
      code,
      redirect_uri: callbackUrl,
      code_verifier: codeVerifier,
    });

    const response = await this.discordFetch(DISCORD_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': DISCORD_USER_AGENT,
      },
      body,
    });

    if (!response.ok) {
      throw new UnauthorizedException('Discord authorization failed');
    }

    const payload = (await response.json()) as DiscordTokenResponse;
    if (!payload.access_token) {
      throw new UnauthorizedException('Discord authorization failed');
    }

    return payload.access_token;
  }

  private async fetchProfile(accessToken: string): Promise<DiscordProfile> {
    const response = await this.discordFetch(DISCORD_USER_URL, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'User-Agent': DISCORD_USER_AGENT,
      },
    });

    if (!response.ok) {
      throw new UnauthorizedException('Could not read Discord profile');
    }

    const profile = (await response.json()) as DiscordApiUser;
    if (!profile.id || !profile.username) {
      throw new UnauthorizedException('Discord profile is incomplete');
    }

    return {
      id: profile.id,
      username: profile.username,
      global_name: profile.global_name ?? null,
      email: profile.email ?? null,
      avatar: profile.avatar ?? null,
      verified: profile.verified,
    };
  }

  private async discordFetch(url: string, init: RequestInit): Promise<Response> {
    try {
      return await fetch(url, {
        ...init,
        signal: AbortSignal.timeout(DISCORD_TIMEOUT_MS),
      });
    } catch {
      throw new UnauthorizedException('Discord authorization failed');
    }
  }
}
