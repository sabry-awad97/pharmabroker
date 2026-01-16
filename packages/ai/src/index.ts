/**
 * @pharmabroker/ai
 *
 * AI abstraction layer supporting multiple providers:
 * - Gemini (Google AI Studio)
 * - Ollama (local models)
 * - OpenAI
 * - Docker Model Runner (local Docker models)
 *
 * @example
 * ```ts
 * import { getAIClient } from '@pharmabroker/ai';
 *
 * const client = getAIClient();
 *
 * // Process a message
 * const result = await client.processMessage({
 *   id: 'msg-123',
 *   text: 'I want to order 10 boxes of aspirin',
 *   timestamp: new Date(),
 * });
 *
 * // Generate text
 * const { text } = await client.generateText('Hello, how are you?');
 * ```
 */

// Types
export type {
  AIProviderName,
  AIProviderConfig,
  AIProvider,
  ExtractionType,
  ExtractionResult,
  MessageInput,
  ProcessingResult,
  BatchOptions,
} from './types';

// Client
export {
  AIClient,
  createAIClient,
  getAIClient,
  type AIClientConfig,
} from './client';

// Providers
export {
  getDefaultProvider,
  createProvider,
  createGeminiProvider,
  createOllamaProvider,
  createOpenAIProvider,
  createDockerModelProvider,
  createDockerEmbeddingProvider,
  DOCKER_MODELS,
  type AIEnvConfig,
} from './providers';

// Extractors
export { ExtractorRegistry, createExtractorRegistry } from './extractors';
