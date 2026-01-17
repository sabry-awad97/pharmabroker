/**
 * AI Provider Configuration Validation
 *
 * Validates environment configuration for AI providers on startup.
 */

import type { AIProvider, AIProviderName } from '../types';
import { createGeminiProvider } from './gemini';
import { createOllamaProvider } from './ollama';
import { createOpenAIProvider } from './openai';
import { createDockerModelProvider } from './docker';
import type { AIEnvConfig } from './index';

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
 * Create an AI provider by name using environment configuration
 *
 * @param name - Provider name
 * @param envConfig - Optional environment config. If not provided, uses @pharmabroker/env/server
 * @throws {Error} if required environment variables are missing or invalid
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
        throw new Error(
          'GEMINI_API_KEY is required for Gemini provider. ' +
            'Set the GEMINI_API_KEY environment variable.',
        );
      }
      return createGeminiProvider({
        apiKey,
        model: config.GEMINI_MODEL,
      });
    }

    case 'ollama':
      if (!config.OLLAMA_BASE_URL) {
        throw new Error(
          'OLLAMA_BASE_URL is required for Ollama provider. ' +
            'Set the OLLAMA_BASE_URL environment variable.',
        );
      }
      if (!config.OLLAMA_MODEL) {
        throw new Error(
          'OLLAMA_MODEL is required for Ollama provider. ' +
            'Set the OLLAMA_MODEL environment variable.',
        );
      }
      return createOllamaProvider({
        baseUrl: config.OLLAMA_BASE_URL,
        model: config.OLLAMA_MODEL,
      });

    case 'openai': {
      const apiKey = config.OPENAI_API_KEY;
      if (!apiKey) {
        throw new Error(
          'OPENAI_API_KEY is required for OpenAI provider. ' +
            'Set the OPENAI_API_KEY environment variable.',
        );
      }
      if (!config.OPENAI_BASE_URL) {
        throw new Error(
          'OPENAI_BASE_URL is required for OpenAI provider. ' +
            'Set the OPENAI_BASE_URL environment variable.',
        );
      }
      if (!config.OPENAI_MODEL) {
        throw new Error(
          'OPENAI_MODEL is required for OpenAI provider. ' +
            'Set the OPENAI_MODEL environment variable.',
        );
      }
      return createOpenAIProvider({
        apiKey,
        baseUrl: config.OPENAI_BASE_URL,
        model: config.OPENAI_MODEL,
      });
    }

    case 'docker':
      if (!config.DOCKER_MODEL_BASE_URL) {
        throw new Error(
          'DOCKER_MODEL_BASE_URL is required for Docker provider. ' +
            'Set the DOCKER_MODEL_BASE_URL environment variable. ' +
            'Example: http://model-runner.docker.internal/engines/v1',
        );
      }
      if (!config.DOCKER_MODEL_NAME) {
        throw new Error(
          'DOCKER_MODEL_NAME is required for Docker provider. ' +
            'Set the DOCKER_MODEL_NAME environment variable. ' +
            'Example: ai/qwen3-vl',
        );
      }
      return createDockerModelProvider({
        baseUrl: config.DOCKER_MODEL_BASE_URL,
        model: config.DOCKER_MODEL_NAME,
      });

    default:
      throw new Error(`Unknown AI provider: ${name}`);
  }
}

/**
 * Validate AI provider configuration on startup
 * Throws detailed errors if configuration is invalid
 *
 * @param envConfig - Optional environment config. If not provided, uses @pharmabroker/env/server
 * @throws {Error} if configuration is invalid
 *
 * @example
 * ```ts
 * // Validate on application startup
 * try {
 *   validateProviderConfig();
 *   console.log('AI provider configuration is valid');
 * } catch (error) {
 *   console.error('AI provider configuration error:', error.message);
 *   process.exit(1);
 * }
 * ```
 */
export function validateProviderConfig(envConfig?: AIEnvConfig): void {
  const config = envConfig ?? getEnv();
  const provider = config.AI_PROVIDER;

  console.log(
    `[AI Providers] Validating configuration for provider: ${provider}`,
  );

  try {
    // Attempt to create the provider - this will throw if config is invalid
    createProvider(provider, config);
    console.log(
      `[AI Providers] ✓ Configuration valid for ${provider} provider`,
    );
  } catch (error) {
    console.error(
      `[AI Providers] ✗ Configuration validation failed for ${provider} provider`,
    );
    throw error;
  }
}
