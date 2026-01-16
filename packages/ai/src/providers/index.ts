/**
 * AI Providers
 *
 * Factory functions for creating AI provider instances.
 * Supports Gemini, Ollama, OpenAI, and Docker Model Runner.
 */

export { createGeminiProvider, type GeminiConfig } from './gemini';
export { createOllamaProvider, type OllamaConfig } from './ollama';
export { createOpenAIProvider, type OpenAIConfig } from './openai';
export {
  createDockerModelProvider,
  createDockerEmbeddingProvider,
  DOCKER_MODELS,
  type DockerModelConfig,
} from './docker';

import type { AIProvider, AIProviderName } from '../types';
import { createGeminiProvider } from './gemini';
import { createOllamaProvider } from './ollama';
import { createOpenAIProvider } from './openai';
import { createDockerModelProvider } from './docker';

/**
 * Environment configuration for AI providers.
 * Can be passed explicitly or loaded from @pharmabroker/env/server.
 */
export interface AIEnvConfig {
  AI_PROVIDER: AIProviderName;
  GEMINI_API_KEY?: string;
  GEMINI_MODEL: string;
  OLLAMA_BASE_URL: string;
  OLLAMA_MODEL: string;
  OPENAI_API_KEY?: string;
  OPENAI_BASE_URL: string;
  OPENAI_MODEL: string;
  DOCKER_MODEL_BASE_URL: string;
  DOCKER_MODEL_NAME: string;
}

// Lazy-loaded env to avoid requiring server env vars when config is provided
let _env: AIEnvConfig | null = null;

function getEnv(): AIEnvConfig {
  if (!_env) {
    // Dynamic import to avoid requiring server env vars at module load time
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { env } = require('@pharmabroker/env/server');
    _env = env as AIEnvConfig;
  }
  return _env;
}

/**
 * Get the default AI provider based on environment configuration
 *
 * @param envConfig - Optional environment config. If not provided, uses @pharmabroker/env/server
 *
 * @example
 * ```ts
 * const provider = getDefaultProvider();
 * const result = await generateText({
 *   model: provider.model,
 *   prompt: 'Hello!',
 * });
 * ```
 */
export function getDefaultProvider(envConfig?: AIEnvConfig): AIProvider {
  const config = envConfig ?? getEnv();
  return createProvider(config.AI_PROVIDER, envConfig);
}

/**
 * Create an AI provider by name using environment configuration
 *
 * @param name - Provider name
 * @param envConfig - Optional environment config. If not provided, uses @pharmabroker/env/server
 */
export function createProvider(
  name: AIProviderName,
  envConfig?: AIEnvConfig,
): AIProvider {
  const config = envConfig ?? getEnv();

  switch (name) {
    case 'gemini': {
      const apiKey = config.GEMINI_API_KEY;
      if (!apiKey) {
        throw new Error('GEMINI_API_KEY is required for Gemini provider');
      }
      return createGeminiProvider({
        apiKey,
        model: config.GEMINI_MODEL,
      });
    }

    case 'ollama':
      return createOllamaProvider({
        baseUrl: config.OLLAMA_BASE_URL,
        model: config.OLLAMA_MODEL,
      });

    case 'openai': {
      const apiKey = config.OPENAI_API_KEY;
      if (!apiKey) {
        throw new Error('OPENAI_API_KEY is required for OpenAI provider');
      }
      return createOpenAIProvider({
        apiKey,
        baseUrl: config.OPENAI_BASE_URL,
        model: config.OPENAI_MODEL,
      });
    }

    case 'docker':
      return createDockerModelProvider({
        baseUrl: config.DOCKER_MODEL_BASE_URL,
        model: config.DOCKER_MODEL_NAME,
      });

    default:
      throw new Error(`Unknown AI provider: ${name}`);
  }
}
