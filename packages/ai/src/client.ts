/**
 * AI Client
 *
 * High-level client for AI operations with automatic provider selection.
 */

import { generateText, streamText, Output } from 'ai';
import type { LanguageModel } from 'ai';
import { z } from 'zod';
import type {
  AIProvider,
  AIProviderName,
  MessageInput,
  ProcessingResult,
  ExtractionType,
  ExtractionResult,
  BatchOptions,
} from './types';
import {
  getDefaultProvider,
  createProvider,
  type AIEnvConfig,
} from './providers';
import { ExtractorRegistry, createExtractorRegistry } from './extractors';

export interface AIClientConfig {
  provider?: AIProviderName;
  /** Optional environment config. If not provided, uses @pharmabroker/env/server */
  envConfig?: AIEnvConfig;
}

/** Options for processing messages with custom schema */
export interface ProcessMessageOptions<T> {
  /** Zod schema for the expected output */
  schema: z.ZodType<T>;
  /** System prompt for the AI */
  systemPrompt: string;
  /** User prompt template - use {{message}} for the message text, {{context}} for context */
  promptTemplate: string;
}

/**
 * AI Client for message processing and text generation
 */
export class AIClient {
  private provider: AIProvider;
  private extractorRegistry: ExtractorRegistry;

  constructor(config: AIClientConfig = {}) {
    this.provider = config.provider
      ? createProvider(config.provider, config.envConfig)
      : getDefaultProvider(config.envConfig);
    this.extractorRegistry = createExtractorRegistry(this.provider.model);
  }

  /** Get the current provider name */
  get providerName(): AIProviderName {
    return this.provider.name;
  }

  /** Get the current model name */
  get modelName(): string {
    return this.provider.config.model;
  }

  /** Get the underlying language model */
  get model(): LanguageModel {
    return this.provider.model;
  }

  /** Check if provider supports structured output */
  get supportsStructuredOutput(): boolean {
    return this.provider.supportsStructuredOutput;
  }

  /**
   * Process a message with a custom schema and prompt
   *
   * @example
   * ```ts
   * const result = await client.processMessage(message, {
   *   schema: z.object({
   *     intent: z.string(),
   *     sentiment: z.enum(['positive', 'negative', 'neutral']),
   *   }),
   *   systemPrompt: 'You are an AI assistant...',
   *   promptTemplate: 'Analyze this message: {{message}}',
   * });
   * ```
   */
  async processMessage<T>(
    message: MessageInput,
    options: ProcessMessageOptions<T>,
  ): Promise<ProcessingResult & { data: T | null }> {
    const startTime = Date.now();

    try {
      // Skip empty messages
      if (!message.text || message.text.trim().length === 0) {
        return {
          messageId: message.id,
          status: 'skipped',
          model: this.modelName,
          extractions: [],
          data: null,
          processingTimeMs: Date.now() - startTime,
        };
      }

      // Build context string
      const contextParts: string[] = [];
      if (message.senderName)
        contextParts.push(`Sender: ${message.senderName}`);
      if (message.groupName) contextParts.push(`Group: ${message.groupName}`);
      if (message.context?.length)
        contextParts.push(`Context: ${message.context.join(', ')}`);
      const contextStr = contextParts.length > 0 ? contextParts.join('\n') : '';

      // Build prompt from template
      const prompt = options.promptTemplate
        .replace('{{message}}', message.text)
        .replace('{{context}}', contextStr);

      // Generate structured output
      const data = await this.generateObject({
        schema: options.schema,
        prompt,
        system: options.systemPrompt,
        temperature: 0.3,
      });

      // Convert to extraction result
      const extractions: ExtractionResult[] = data
        ? [
            {
              type: 'structured',
              data,
              confidence: 1.0,
            },
          ]
        : [];

      return {
        messageId: message.id,
        status: data ? 'completed' : 'failed',
        model: this.modelName,
        extractions,
        data,
        processingTimeMs: Date.now() - startTime,
      };
    } catch (error) {
      return {
        messageId: message.id,
        status: 'failed',
        model: this.modelName,
        extractions: [],
        data: null,
        error: error instanceof Error ? error.message : 'Unknown error',
        processingTimeMs: Date.now() - startTime,
      };
    }
  }

  /**
   * Process multiple messages in batch
   */
  async processMessages<T>(
    messages: MessageInput[],
    options: ProcessMessageOptions<T> & BatchOptions,
  ): Promise<(ProcessingResult & { data: T | null })[]> {
    const { concurrency = 5, skipOnError = true, ...processOptions } = options;
    const results: (ProcessingResult & { data: T | null })[] = [];

    for (let i = 0; i < messages.length; i += concurrency) {
      const batch = messages.slice(i, i + concurrency);
      const batchResults = await Promise.all(
        batch.map(async message => {
          try {
            return await this.processMessage(message, processOptions);
          } catch (error) {
            if (!skipOnError) throw error;
            return {
              messageId: message.id,
              status: 'failed' as const,
              model: this.modelName,
              extractions: [],
              data: null,
              error: error instanceof Error ? error.message : 'Unknown error',
              processingTimeMs: 0,
            };
          }
        }),
      );
      results.push(...batchResults);
    }

    return results;
  }

  /**
   * Generate text using the AI model
   */
  async generateText(
    prompt: string,
    options?: { system?: string; temperature?: number },
  ) {
    return generateText({
      model: this.provider.model,
      prompt,
      system: options?.system,
      temperature: options?.temperature ?? 0.7,
    });
  }

  /**
   * Generate structured output using the AI model
   *
   * Uses native structured output for providers that support it,
   * falls back to JSON parsing for providers that don't.
   */
  async generateObject<T>(options: {
    schema: z.ZodType<T>;
    prompt: string;
    system?: string;
    temperature?: number;
  }): Promise<T | null> {
    if (this.provider.supportsStructuredOutput) {
      const result = await generateText({
        model: this.provider.model,
        prompt: options.prompt,
        system: options.system,
        temperature: options.temperature ?? 0.3,
        experimental_output: Output.object({ schema: options.schema }),
      });
      return result.experimental_output ?? null;
    }

    // Fallback: JSON parsing for providers without structured output
    return this.generateObjectWithJsonParsing(options);
  }

  /**
   * Generate structured output using JSON parsing
   */
  private async generateObjectWithJsonParsing<T>(options: {
    schema: z.ZodType<T>;
    prompt: string;
    system?: string;
    temperature?: number;
  }): Promise<T | null> {
    // Generate schema description from Zod schema
    const schemaExample = this.generateSchemaExample(options.schema);

    const jsonPrompt = `${options.prompt}

You MUST respond with ONLY a valid JSON object in this exact format:
${schemaExample}

IMPORTANT: Output ONLY the JSON object. No markdown, no code blocks, no explanations.`;

    const result = await generateText({
      model: this.provider.model,
      prompt: jsonPrompt,
      system: options.system,
      temperature: options.temperature ?? 0.3,
    });

    return this.parseJsonResponse(result.text, options.schema);
  }

  /**
   * Generate a JSON example from a Zod schema using proper Zod v4 APIs
   */
  private generateSchemaExample(schema: z.ZodType<unknown>): string {
    try {
      if (schema instanceof z.ZodObject) {
        const example: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(schema.shape)) {
          example[key] = this.getExampleValue(value as z.ZodType<unknown>);
        }
        return JSON.stringify(example, null, 2);
      }
      return '{ }';
    } catch {
      return '{ }';
    }
  }

  /**
   * Get an example value for a Zod type using instanceof checks (Zod v4)
   */
  private getExampleValue(type: z.ZodType<unknown>): unknown {
    if (type instanceof z.ZodString) {
      return 'string';
    }
    if (type instanceof z.ZodNumber) {
      return 0;
    }
    if (type instanceof z.ZodBoolean) {
      return true;
    }
    if (type instanceof z.ZodEnum) {
      return type.options.join(' | ');
    }
    if (type instanceof z.ZodArray) {
      return [this.getExampleValue(type.element as z.ZodType<unknown>)];
    }
    if (type instanceof z.ZodObject) {
      const obj: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(type.shape)) {
        obj[k] = this.getExampleValue(v as z.ZodType<unknown>);
      }
      return obj;
    }
    if (type instanceof z.ZodOptional || type instanceof z.ZodNullable) {
      return this.getExampleValue(type.unwrap() as z.ZodType<unknown>);
    }
    return null;
  }

  /**
   * Parse JSON response and validate against schema
   */
  private parseJsonResponse<T>(text: string, schema: z.ZodType<T>): T | null {
    try {
      // Clean the response - remove markdown code blocks if present
      let jsonText = text.trim();

      // Remove markdown code blocks
      if (jsonText.startsWith('```json')) {
        jsonText = jsonText.slice(7);
      } else if (jsonText.startsWith('```')) {
        jsonText = jsonText.slice(3);
      }
      if (jsonText.endsWith('```')) {
        jsonText = jsonText.slice(0, -3);
      }
      jsonText = jsonText.trim();

      // Try to extract JSON if there's extra text
      const jsonMatch = jsonText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        jsonText = jsonMatch[0];
      }

      const parsed = JSON.parse(jsonText);
      return schema.parse(parsed);
    } catch (error) {
      // Log parsing errors for debugging
      console.error(
        '[AI Client] JSON parsing failed:',
        error instanceof Error ? error.message : error,
      );
      console.error('[AI Client] Raw text length:', text.length);
      console.error(
        '[AI Client] Raw text (first 1000 chars):',
        text.substring(0, 1000),
      );
      return null;
    }
  }

  /**
   * Stream text generation
   */
  streamText(
    prompt: string,
    options?: { system?: string; temperature?: number },
  ) {
    return streamText({
      model: this.provider.model,
      prompt,
      system: options?.system,
      temperature: options?.temperature ?? 0.7,
    });
  }

  /**
   * Run a specific extraction on a message (placeholder)
   */
  async extract(type: ExtractionType, message: MessageInput) {
    return this.extractorRegistry.extract(type, message);
  }

  /**
   * Get the extractor registry for custom configuration
   */
  getExtractorRegistry(): ExtractorRegistry {
    return this.extractorRegistry;
  }
}

/**
 * Create an AI client with default configuration
 */
export function createAIClient(config?: AIClientConfig): AIClient {
  return new AIClient(config);
}

// Singleton instance
let defaultClient: AIClient | null = null;

/**
 * Get the default AI client (singleton)
 */
export function getAIClient(): AIClient {
  if (!defaultClient) {
    defaultClient = createAIClient();
  }
  return defaultClient;
}
