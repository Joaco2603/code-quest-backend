import {
  BadGatewayException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ROADMAP_RESPONSE_FORMAT } from './plan-personal-roadmap.js';

@Injectable()
export class OpenAiRoadmapClient {
  private readonly logger = new Logger(OpenAiRoadmapClient.name);

  async complete(system: string, user: string) {
    const apiKey = process.env.OPENAI_API_KEY?.trim();
    const model = process.env.OPENAI_MODEL?.trim() || 'gpt-4.1-mini';
    if (!apiKey)
      throw new ServiceUnavailableException(
        'Roadmap generation is not configured',
      );
    const timeout = readTimeout(process.env.OPENAI_TIMEOUT_MS);
    try {
      const response = await fetch(
        'https://api.openai.com/v1/chat/completions',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          signal: AbortSignal.timeout(timeout),
          body: JSON.stringify({
            model,
            max_completion_tokens: 600,
            messages: [
              { role: 'system', content: system },
              { role: 'user', content: user },
            ],
            response_format: ROADMAP_RESPONSE_FORMAT,
          }),
        },
      );
      if (!response.ok) throw new Error(`openai ${response.status}`);
      const body = (await response.json()) as {
        model?: string;
        choices?: Array<{ message?: { content?: string | null } }>;
      };
      const content = body.choices?.[0]?.message?.content;
      if (!content) throw new Error('empty completion');
      return { content, model: body.model || model };
    } catch (error) {
      if (error instanceof ServiceUnavailableException) throw error;
      this.logger.warn(
        `OpenAI roadmap request failed: ${error instanceof Error ? error.name : 'unknown'}`,
      );
      throw new BadGatewayException(
        'The roadmap model did not return a usable plan',
      );
    }
  }
}

function readTimeout(raw: string | undefined) {
  const value = Number(raw ?? 25_000);
  if (!Number.isInteger(value) || value < 1000 || value > 120_000) return 25_000;
  return value;
}
