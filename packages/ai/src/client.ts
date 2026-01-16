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
  extractionTypes?: ExtractionType[];
  /** Optional environment config. If not provided, uses @pharmabroker/env/server */
  envConfig?: AIEnvConfig;
}

// Schema for AI message analysis
const messageAnalysisSchema = z.object({
  intent: z.object({
    type: z
      .string()
      .describe(
        'The primary intent: order, inquiry, complaint, greeting, support, other',
      ),
    confidence: z.number().min(0).max(1).describe('Confidence score 0-1'),
  }),
  sentiment: z.object({
    label: z
      .enum(['positive', 'negative', 'neutral'])
      .describe('Overall sentiment'),
    score: z
      .number()
      .min(-1)
      .max(1)
      .describe('Sentiment score from -1 (negative) to 1 (positive)'),
  }),
  entities: z
    .array(
      z.object({
        type: z
          .string()
          .describe(
            'Entity type: product, quantity, price, date, person, location, phone, email',
          ),
        value: z.string().describe('The extracted value'),
        confidence: z.number().min(0).max(1).describe('Confidence score 0-1'),
      }),
    )
    .describe('Extracted entities from the message'),
  summary: z
    .string()
    .optional()
    .describe('Brief summary of the message if complex'),
});

/**
 * AI Client for message processing and text generation
 */
export class AIClient {
  private provider: AIProvider;
  private extractorRegistry: ExtractorRegistry;
  private extractionTypes: ExtractionType[];

  constructor(config: AIClientConfig = {}) {
    this.provider = config.provider
      ? createProvider(config.provider, config.envConfig)
      : getDefaultProvider(config.envConfig);
    this.extractorRegistry = createExtractorRegistry(this.provider.model);
    this.extractionTypes = config.extractionTypes ?? [];
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

  /**
   * Process a message and extract structured data using AI
   */
  async processMessage(message: MessageInput): Promise<ProcessingResult> {
    const startTime = Date.now();

    try {
      // Skip empty messages
      if (!message.text || message.text.trim().length === 0) {
        return {
          messageId: message.id,
          status: 'skipped',
          model: this.modelName,
          extractions: [],
          processingTimeMs: Date.now() - startTime,
        };
      }

      // Build context for the AI
      const contextParts: string[] = [];
      if (message.senderName)
        contextParts.push(`Sender: ${message.senderName}`);
      if (message.groupName) contextParts.push(`Group: ${message.groupName}`);
      if (message.context?.length)
        contextParts.push(`Context: ${message.context.join(', ')}`);

      const contextStr =
        contextParts.length > 0 ? `\n${contextParts.join('\n')}` : '';

      const prompt = `Analyze this WhatsApp message from a pharmaceutical distribution business context.${contextStr}

Message: "${message.text}"

Extract the intent, sentiment, and any relevant entities (products, quantities, prices, dates, contacts, etc.).`;

      const systemPrompt = `You are an AI assistant specialized in analyzing WhatsApp messages for a pharmaceutical distribution company. 
Your task is to extract structured information from messages including:
- Intent classification (order, inquiry, complaint, greeting, support, other)
- Sentiment analysis (positive, negative, neutral)
- Entity extraction (products, quantities, prices, dates, people, locations, phone numbers, emails)

Be precise and only extract information that is clearly present in the message.
For confidence scores, use 0.9+ for very clear cases, 0.7-0.9 for likely cases, and below 0.7 for uncertain cases.`;

      // Call the AI model with structured output
      const result = await generateText({
        model: this.provider.model,
        prompt,
        system: systemPrompt,
        temperature: 0.3,
        experimental_output: Output.object({ schema: messageAnalysisSchema }),
      });

      // Convert AI response to extraction results
      const extractions: ExtractionResult[] = [];
      const analysis = result.experimental_output;

      if (analysis) {
        // Add intent extraction
        extractions.push({
          type: 'intent',
          data: { type: analysis.intent.type },
          confidence: analysis.intent.confidence,
        });

        // Add sentiment extraction
        extractions.push({
          type: 'sentiment',
          data: {
            label: analysis.sentiment.label,
            score: analysis.sentiment.score,
          },
          confidence: Math.abs(analysis.sentiment.score) > 0.5 ? 0.9 : 0.7,
        });

        // Add entity extractions
        for (const entity of analysis.entities) {
          extractions.push({
            type: `entity:${entity.type}`,
            data: { value: entity.value },
            confidence: entity.confidence,
          });
        }

        // Add summary if present
        if (analysis.summary) {
          extractions.push({
            type: 'summary',
            data: { text: analysis.summary },
            confidence: 0.9,
          });
        }
      }

      return {
        messageId: message.id,
        status: 'completed',
        model: this.modelName,
        extractions,
        processingTimeMs: Date.now() - startTime,
      };
    } catch (error) {
      return {
        messageId: message.id,
        status: 'failed',
        model: this.modelName,
        extractions: [],
        error: error instanceof Error ? error.message : 'Unknown error',
        processingTimeMs: Date.now() - startTime,
      };
    }
  }

  /**
   * Process multiple messages in batch
   */
  async processMessages(
    messages: MessageInput[],
    options: BatchOptions = {},
  ): Promise<ProcessingResult[]> {
    const { concurrency = 3, skipOnError = true } = options;
    const results: ProcessingResult[] = [];

    // Process in batches for concurrency control
    for (let i = 0; i < messages.length; i += concurrency) {
      const batch = messages.slice(i, i + concurrency);
      const batchResults = await Promise.all(
        batch.map(async message => {
          try {
            return await this.processMessage(message);
          } catch (error) {
            if (!skipOnError) throw error;
            return {
              messageId: message.id,
              status: 'failed' as const,
              model: this.modelName,
              extractions: [],
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
   */
  async generateObject<T>(options: {
    schema: z.ZodType<T>;
    prompt: string;
    system?: string;
    temperature?: number;
  }) {
    return generateText({
      model: this.provider.model,
      prompt: options.prompt,
      system: options.system,
      temperature: options.temperature ?? 0.3,
      experimental_output: Output.object({ schema: options.schema }),
    });
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
   * Run a specific extraction on a message
   * Note: Placeholder until extraction types are defined
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
