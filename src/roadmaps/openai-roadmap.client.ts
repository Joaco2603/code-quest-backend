import {
  BadGatewayException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { ROADMAP_RESPONSE_FORMAT } from './plan-roadmap.js';

@Injectable()
export class OpenAiRoadmapClient {
  private readonly logger = new Logger(OpenAiRoadmapClient.name);

  constructor(private readonly config: ConfigService) {}

  async complete(system: string, user: string) {
    const apiKey = this.config.get<string>('openai.apiKey');
    const model = this.config.get<string>('openai.model') ?? 'gpt-4.1-mini';
    if (!apiKey)
      throw new ServiceUnavailableException(
        'Roadmap generation is not configured',
      );
    const timeout = this.config.get<number>('openai.timeoutMs') ?? 25_000;
    const client = new OpenAI({ apiKey, timeout, maxRetries: 1 });
    try {
      const completion = await client.chat.completions.create({
        model,
        max_completion_tokens: 600,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        response_format: ROADMAP_RESPONSE_FORMAT,
      });
      const content = completion.choices[0]?.message?.content;
      if (!content) throw new Error('empty completion');
      return { content, model: completion.model || model };
    } catch (error) {
      this.logger.warn(
        `OpenAI roadmap request failed: ${error instanceof Error ? error.name : 'unknown'}`,
      );
      throw new BadGatewayException(
        'The roadmap model did not return a usable plan',
      );
    }
  }
}
