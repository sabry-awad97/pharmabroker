/**
 * AI Client
 *
 * High-level client for AI operations with automatic provider selection.
 */

import { generateText, streamText, Output } from 'ai';
import type { LanguageModel } from 'ai';
import { z } from 'zod';
import { encodingForModel, type TiktokenModel } from 'js-tiktoken';
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

/** Debug info for message processing */
export interface ProcessingDebugInfo {
  messageChars: number;
  messageLines: number;
  messageTokens: number;
  promptTokens: number;
  totalInputTokens: number;
  outputTokens?: number;
  chunksUsed: number;
  tokensPerChunk?: number;
}

/** Result from generateObject with usage info */
interface GenerateObjectResult<T> {
  data: T | null;
  outputTokens?: number;
}

/**
 * AI Client for message processing and text generation
 */
export class AIClient {
  private provider: AIProvider;
  private extractorRegistry: ExtractorRegistry;
  private tokenEncoder: ReturnType<typeof encodingForModel> | null = null;

  constructor(config: AIClientConfig = {}) {
    this.provider = config.provider
      ? createProvider(config.provider, config.envConfig)
      : getDefaultProvider(config.envConfig);
    this.extractorRegistry = createExtractorRegistry(this.provider.model);

    // Initialize tiktoken encoder (use gpt-4 as baseline)
    try {
      this.tokenEncoder = encodingForModel('gpt-4' as TiktokenModel);
    } catch {
      this.tokenEncoder = null;
    }
  }

  get providerName(): AIProviderName {
    return this.provider.name;
  }

  get modelName(): string {
    return this.provider.config.model;
  }

  get model(): LanguageModel {
    return this.provider.model;
  }

  get supportsStructuredOutput(): boolean {
    return this.provider.supportsStructuredOutput;
  }

  /** Count tokens using tiktoken, with fallback estimation */
  private countTokens(text: string): number {
    if (this.tokenEncoder) {
      try {
        return this.tokenEncoder.encode(text).length;
      } catch {
        // Fallback on encoding error
      }
    }
    const hasArabic = /[\u0600-\u06FF]/.test(text);
    return Math.ceil(text.length / (hasArabic ? 2 : 4));
  }

  /** Build debug info for a message */
  private buildDebugInfo(
    message: string,
    promptTokens: number,
    chunksUsed = 1,
    tokensPerChunk?: number,
    outputTokens?: number,
  ): ProcessingDebugInfo {
    const messageTokens = this.countTokens(message);
    return {
      messageChars: message.length,
      messageLines: message.split('\n').length,
      messageTokens,
      promptTokens,
      totalInputTokens: messageTokens + promptTokens,
      outputTokens,
      chunksUsed,
      tokensPerChunk,
    };
  }

  /**
   * Process a message with a custom schema and prompt
   * Automatically chunks long messages to avoid context limits
   */
  async processMessage<T>(
    message: MessageInput,
    options: ProcessMessageOptions<T>,
  ): Promise<
    ProcessingResult & { data: T | null; debug?: ProcessingDebugInfo }
  > {
    const startTime = Date.now();

    try {
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

      const messageTokens = this.countTokens(message.text);
      const messageLines = message.text
        .split('\n')
        .filter(l => l.trim()).length;
      const promptTokens = this.countTokens(
        options.systemPrompt + options.promptTemplate,
      );

      const maxInputTokens = 4000;
      const availableTokens = maxInputTokens - promptTokens;
      const maxLines = 15;

      // Chunk if exceeds token budget OR exceeds 15 lines
      if (messageTokens > availableTokens || messageLines > maxLines) {
        return this.processMessageInChunks(
          message,
          options,
          startTime,
          availableTokens,
          promptTokens,
        );
      }

      return this.processMessageDirect(
        message,
        options,
        startTime,
        promptTokens,
      );
    } catch (error) {
      const promptTokens = this.countTokens(
        options.systemPrompt + options.promptTemplate,
      );
      const debugInfo = this.buildDebugInfo(message.text, promptTokens);

      return {
        messageId: message.id,
        status: 'failed',
        model: this.modelName,
        extractions: [],
        data: null,
        error: error instanceof Error ? error.message : 'Unknown error',
        processingTimeMs: Date.now() - startTime,
        debug: debugInfo,
      };
    }
  }

  /** Process a message directly without chunking */
  private async processMessageDirect<T>(
    message: MessageInput,
    options: ProcessMessageOptions<T>,
    startTime: number,
    promptTokens: number,
  ): Promise<
    ProcessingResult & { data: T | null; debug?: ProcessingDebugInfo }
  > {
    const contextParts: string[] = [];
    if (message.senderName) contextParts.push(`Sender: ${message.senderName}`);
    if (message.groupName) contextParts.push(`Group: ${message.groupName}`);
    if (message.context?.length)
      contextParts.push(`Context: ${message.context.join(', ')}`);
    const contextStr = contextParts.length > 0 ? contextParts.join('\n') : '';

    const prompt = options.promptTemplate
      .replace('{{message}}', message.text)
      .replace('{{context}}', contextStr);

    const result = await this.generateObject({
      schema: options.schema,
      prompt,
      system: options.systemPrompt,
      temperature: 0.3,
    });

    const debugInfo = this.buildDebugInfo(
      message.text,
      promptTokens,
      1,
      undefined,
      result.outputTokens,
    );

    const extractions: ExtractionResult[] = result.data
      ? [{ type: 'structured', data: result.data, confidence: 1.0 }]
      : [];

    return {
      messageId: message.id,
      status: result.data ? 'completed' : 'failed',
      model: this.modelName,
      extractions,
      data: result.data,
      processingTimeMs: Date.now() - startTime,
      debug: debugInfo,
    };
  }

  /** Process a long message in chunks based on token budget and line limit */
  private async processMessageInChunks<T>(
    message: MessageInput,
    options: ProcessMessageOptions<T>,
    startTime: number,
    tokenBudget: number,
    promptTokens: number,
  ): Promise<
    ProcessingResult & { data: T | null; debug?: ProcessingDebugInfo }
  > {
    const lines = message.text.split('\n');

    // Extract header lines (first 2-3 non-empty lines that establish context/intent)
    const headerLines: string[] = [];
    let headerTokens = 0;
    const maxHeaderLines = 3;

    for (const line of lines) {
      if (headerLines.length >= maxHeaderLines) break;
      const trimmed = line.trim();
      if (trimmed) {
        headerLines.push(line);
        headerTokens += this.countTokens(line + '\n');
      }
    }

    const headerText =
      headerLines.length > 0 ? headerLines.join('\n') + '\n' : '';

    // Build chunks, prepending header to each chunk (except first which already has it)
    const chunks: string[] = [];
    let currentChunk: string[] = [];
    let currentTokens = 0;
    const maxLinesPerChunk = 12;

    // Cap token budget per chunk, accounting for header in subsequent chunks
    const effectiveTokenBudget = Math.min(tokenBudget, 500);
    const budgetForContent = effectiveTokenBudget - headerTokens;

    for (const line of lines) {
      const lineTokens = this.countTokens(line + '\n');

      // Start new chunk if exceeds token budget OR exceeds line limit
      const exceedsTokens =
        currentTokens + lineTokens >
          (chunks.length === 0 ? effectiveTokenBudget : budgetForContent) &&
        currentChunk.length > 0;
      const exceedsLines = currentChunk.length >= maxLinesPerChunk;

      if (exceedsTokens || exceedsLines) {
        chunks.push(currentChunk.join('\n'));
        currentChunk = [];
        currentTokens = 0;
      }

      currentChunk.push(line);
      currentTokens += lineTokens;
    }

    if (currentChunk.length > 0) {
      chunks.push(currentChunk.join('\n'));
    }

    // Prepend header to chunks after the first one to preserve context
    const chunksWithHeader = chunks.map((chunk, index) => {
      if (index === 0) return chunk; // First chunk already has header
      // Check if chunk already starts with header content
      if (chunk.startsWith(headerLines[0] || '')) return chunk;
      return `[CONTEXT - DO NOT EXTRACT MEDICATIONS FROM THIS SECTION, ONLY USE FOR INTENT:]\n${headerText}\n[EXTRACT MEDICATIONS FROM THIS SECTION:]\n${chunk}`;
    });

    const debugInfo = this.buildDebugInfo(
      message.text,
      promptTokens,
      chunks.length,
      effectiveTokenBudget,
    );

    console.log(
      `[AI Client] Chunking: ${debugInfo.messageTokens} tokens, ${debugInfo.messageLines} lines → ${chunks.length} chunks (max ${maxLinesPerChunk} lines, ~${effectiveTokenBudget} tokens/chunk, header: ${headerLines.length} lines)`,
    );

    // Process chunks sequentially to avoid overwhelming the model
    const results: (ProcessingResult & {
      data: T | null;
      debug?: ProcessingDebugInfo;
    })[] = [];
    for (let i = 0; i < chunksWithHeader.length; i++) {
      const chunk = chunksWithHeader[i]!;
      console.log(
        `[AI Client] Processing chunk ${i + 1}/${chunksWithHeader.length}...`,
      );
      const result = await this.processMessageDirect(
        {
          ...message,
          text: chunk,
          id: i === 0 ? message.id : `${message.id}-${i}`,
        },
        options,
        startTime,
        promptTokens,
      );
      results.push(result);
    }

    const firstSuccess = results.find(r => r.data);
    if (!firstSuccess?.data) {
      const errors = results
        .filter(r => r.error)
        .map(r => r.error)
        .join('; ');
      // Sum output tokens from all chunks
      const totalOutputTokens = results.reduce(
        (sum, r) => sum + (r.debug?.outputTokens ?? 0),
        0,
      );
      debugInfo.outputTokens = totalOutputTokens;
      return {
        messageId: message.id,
        status: 'failed',
        model: this.modelName,
        extractions: [],
        data: null,
        error: `All ${chunks.length} chunks failed: ${errors}`,
        processingTimeMs: Date.now() - startTime,
        debug: debugInfo,
      };
    }

    const allMedications: unknown[] = [];
    for (const result of results) {
      if (result.data) {
        const data = result.data as Record<string, unknown>;
        if (Array.isArray(data.medications)) {
          allMedications.push(...data.medications);
        }
      }
    }

    // Sum output tokens from all chunks
    const totalOutputTokens = results.reduce(
      (sum, r) => sum + (r.debug?.outputTokens ?? 0),
      0,
    );
    debugInfo.outputTokens = totalOutputTokens;

    const uniqueMedications = this.deduplicateMedications(allMedications);
    const firstData = firstSuccess.data as Record<string, unknown>;
    const mergedData = {
      ...firstData,
      medications: uniqueMedications,
      reason: `${firstData.reason} (${chunks.length} chunks, ${uniqueMedications.length} meds)`,
    } as T;

    return {
      messageId: message.id,
      status: 'completed',
      model: this.modelName,
      extractions: [{ type: 'structured', data: mergedData, confidence: 1.0 }],
      data: mergedData,
      processingTimeMs: Date.now() - startTime,
      debug: debugInfo,
    };
  }

  /** Deduplicate medications by name+concentration+form */
  private deduplicateMedications(medications: unknown[]): unknown[] {
    const seen = new Map<string, { med: unknown; confidence: number }>();
    for (const med of medications) {
      const m = med as Record<string, unknown>;
      const key = `${m.name}|${m.concentration || ''}|${m.form || ''}`;
      const confidence = (m.confidence as number) || 0;
      const existing = seen.get(key);
      if (!existing || existing.confidence < confidence) {
        seen.set(key, { med, confidence });
      }
    }
    return Array.from(seen.values()).map(v => v.med);
  }

  /** Process multiple messages in batch */
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

  /** Generate text using the AI model */
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

  /** Generate structured output using the AI model */
  async generateObject<T>(options: {
    schema: z.ZodType<T>;
    prompt: string;
    system?: string;
    temperature?: number;
  }): Promise<GenerateObjectResult<T>> {
    if (this.provider.supportsStructuredOutput) {
      const result = await generateText({
        model: this.provider.model,
        prompt: options.prompt,
        system: options.system,
        temperature: options.temperature ?? 0.3,
        output: Output.object({ schema: options.schema }),
      });
      return {
        data: result.output ?? null,
        outputTokens: result.usage?.outputTokens,
      };
    }
    return this.generateObjectWithJsonParsing(options);
  }

  /** Generate structured output using JSON parsing */
  private async generateObjectWithJsonParsing<T>(options: {
    schema: z.ZodType<T>;
    prompt: string;
    system?: string;
    temperature?: number;
  }): Promise<GenerateObjectResult<T>> {
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

    return {
      data: this.parseJsonResponse(result.text, options.schema),
      outputTokens: result.usage?.outputTokens,
    };
  }

  /** Generate a JSON example from a Zod schema */
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

  /** Get an example value for a Zod type */
  private getExampleValue(type: z.ZodType<unknown>): unknown {
    if (type instanceof z.ZodString) return 'string';
    if (type instanceof z.ZodNumber) return 0;
    if (type instanceof z.ZodBoolean) return true;
    if (type instanceof z.ZodEnum) return type.options.join(' | ');
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

  /** Parse JSON response and validate against schema */
  private parseJsonResponse<T>(text: string, schema: z.ZodType<T>): T | null {
    let jsonText = text.trim();

    if (jsonText.startsWith('```json')) jsonText = jsonText.slice(7);
    else if (jsonText.startsWith('```')) jsonText = jsonText.slice(3);
    if (jsonText.endsWith('```')) jsonText = jsonText.slice(0, -3);
    jsonText = jsonText.trim();

    const jsonMatch = jsonText.match(/\{[\s\S]*\}/);
    if (jsonMatch) jsonText = jsonMatch[0];

    try {
      const parsed = JSON.parse(jsonText);
      return schema.parse(parsed);
    } catch (error) {
      console.error(
        '[AI Client] JSON parsing failed:',
        error instanceof Error ? error.message : error,
      );
      console.error('[AI Client] Raw text length:', text.length);
      console.error(
        '[AI Client] Raw text (first 500 chars):',
        text.substring(0, 500),
      );
      return null;
    }
  }

  /** Stream text generation */
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

  /** Run a specific extraction on a message */
  async extract(type: ExtractionType, message: MessageInput) {
    return this.extractorRegistry.extract(type, message);
  }

  /** Get the extractor registry */
  getExtractorRegistry(): ExtractorRegistry {
    return this.extractorRegistry;
  }
}

/** Create an AI client with default configuration */
export function createAIClient(config?: AIClientConfig): AIClient {
  return new AIClient(config);
}

let defaultClient: AIClient | null = null;

/** Get the default AI client (singleton) */
export function getAIClient(): AIClient {
  if (!defaultClient) {
    defaultClient = createAIClient();
  }
  return defaultClient;
}
