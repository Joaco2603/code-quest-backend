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
    const baseURL = this.config.get<string>('openai.baseURL')?.trim() || undefined;
    const nodeEnv =
      this.config.get<string>('app.nodeEnv') ??
      process.env.NODE_ENV ??
      'development';
    // A custom base URL points to a local OpenAI-compatible server which
    // usually accepts any key. Allow a placeholder outside production so
    // local runs work without a real secret; production still requires one.
    const effectiveApiKey =
      apiKey ?? (baseURL && nodeEnv !== 'production' ? 'ollama' : undefined);
    if (!effectiveApiKey)
      throw new ServiceUnavailableException(
        'Roadmap generation is not configured',
      );
    const timeout = this.config.get<number>('openai.timeoutMs') ?? 25_000;
    const client = baseURL
      ? new OpenAI({ apiKey: effectiveApiKey, baseURL, timeout, maxRetries: 1 })
      : new OpenAI({ apiKey: effectiveApiKey, timeout, maxRetries: 1 });
    const messages = [
      { role: 'system' as const, content: system },
      { role: 'user' as const, content: user },
    ];
    try {
      const completion = await client.chat.completions.create({
        model,
        max_completion_tokens: 600,
        messages: [...messages],
        response_format: ROADMAP_RESPONSE_FORMAT,
      });
      const content = completion.choices[0]?.message?.content;
      if (!content) throw new Error('empty completion');
      return { content, model: completion.model || model };
    } catch (error) {
      if (!baseURL || !isStrictFormatError(error)) {
        this.logger.warn(
          `OpenAI roadmap request failed: ${error instanceof Error ? error.name : 'unknown'}`,
        );
        throw new BadGatewayException(
          'The roadmap model did not return a usable plan',
        );
      }
      this.logger.warn(
        `Roadmap model rejected strict format, retrying with plain JSON: ${error instanceof Error ? error.name : 'unknown'}`,
      );
      try {
        const completion = await client.chat.completions.create({
          model,
          max_tokens: 600,
          messages: [...messages],
        });
        const content = completion.choices[0]?.message?.content;
        if (!content) throw new Error('empty completion');
        return { content, model: completion.model || model };
      } catch (fallbackError) {
        this.logger.warn(
          `OpenAI roadmap request failed: ${fallbackError instanceof Error ? fallbackError.name : 'unknown'}`,
        );
        throw new BadGatewayException(
          'The roadmap model did not return a usable plan',
        );
      }
    }
  }
}

// Local OpenAI-compatible servers (Ollama, LM Studio, vLLM) may reject the
// strict JSON-schema response format or the newer token parameter. Detect
// those rejections so the caller retries once with plain parameters.
function isStrictFormatError(error: unknown): boolean {
  const status = (error as { status?: unknown })?.status;
  if (typeof status === 'number' && status !== 400) return false;
  if (status === 400) return true;
  const message = error instanceof Error ? error.message.toLowerCase() : '';
  return /response_format|json_schema|max_completion_tokens|unsupported|unrecognized|unknown parameter|invalid parameter/.test(
    message,
  );
}
