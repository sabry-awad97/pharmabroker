/**
 * Docker Model Runner Provider
 *
 * Uses @ai-sdk/openai-compatible for Docker Desktop's Model Runner.
 * Supports models like qwen3-vl, ministral3, gemma3, etc.
 *
 * Docker Model Runner exposes an OpenAI-compatible API:
 * - From containers: http://model-runner.docker.internal/engines/v1
 * - From host (TCP): http://localhost:12434/engines/v1
 *
 * The engine name in the path is optional:
 * - /engines/v1/ (auto-selects engine)
 * - /engines/llama.cpp/v1/ (explicit llama.cpp)
 * - /engines/vllm/v1/ (explicit vLLM)
 *
 * When using docker-compose model bindings, the URL is auto-injected.
 *
 * IMPORTANT: This provider requires environment variables to be set:
 * - DOCKER_MODEL_BASE_URL: Base URL for the model API
 * - DOCKER_MODEL_NAME: Model identifier (e.g., 'ai/qwen3-vl')
 * - EMBEDDING_MODEL_URL: Base URL for embedding API (optional, defaults to DOCKER_MODEL_BASE_URL)
 * - EMBEDDING_MODEL_NAME: Embedding model identifier (optional, defaults to 'ai/embeddinggemma')
 */

import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import type { AIProvider, AIProviderConfig } from '../types';

export interface DockerModelConfig {
  /** Base URL for the Docker Model Runner API (REQUIRED) */
  baseUrl: string;
  /** Model identifier (e.g., 'ai/qwen3-vl') (REQUIRED) */
  model: string;
}

/** Available Docker Model Runner models */
export const DOCKER_MODELS = {
  QWEN: 'ai/qwen3-vl',
  MINISTRAL: 'ai/ministral3',
  GEMMA: 'ai/gemma3',
  EMBEDDING: 'ai/embeddinggemma',
} as const;

/**
 * Validate Docker Model configuration
 * @throws {Error} if configuration is invalid
 */
function validateDockerConfig(
  config: DockerModelConfig,
  type: 'model' | 'embedding',
): void {
  if (!config.baseUrl) {
    throw new Error(
      `Docker ${type} configuration error: baseUrl is required. ` +
        `Set ${type === 'model' ? 'DOCKER_MODEL_BASE_URL' : 'EMBEDDING_MODEL_URL'} environment variable.`,
    );
  }

  if (!config.model) {
    throw new Error(
      `Docker ${type} configuration error: model is required. ` +
        `Set ${type === 'model' ? 'DOCKER_MODEL_NAME' : 'EMBEDDING_MODEL_NAME'} environment variable.`,
    );
  }

  // Validate URL format
  try {
    new URL(config.baseUrl);
  } catch {
    throw new Error(
      `Docker ${type} configuration error: baseUrl "${config.baseUrl}" is not a valid URL. ` +
        `Check ${type === 'model' ? 'DOCKER_MODEL_BASE_URL' : 'EMBEDDING_MODEL_URL'} environment variable.`,
    );
  }

  // Warn about common misconfigurations
  if (
    config.baseUrl.includes('localhost') &&
    process.env.NODE_ENV === 'production'
  ) {
    console.warn(
      `[Docker Provider] Warning: Using localhost URL in production: ${config.baseUrl}. ` +
        `This may not work in containerized environments. ` +
        `Consider using 'model-runner.docker.internal' or a proper service name.`,
    );
  }
}

/**
 * Create a Docker Model Runner provider instance
 *
 * @example
 * ```ts
 * // Use environment variables (recommended)
 * const provider = createDockerModelProvider({
 *   baseUrl: process.env.DOCKER_MODEL_BASE_URL!,
 *   model: process.env.DOCKER_MODEL_NAME!,
 * });
 *
 * // Explicit configuration
 * const provider = createDockerModelProvider({
 *   baseUrl: 'http://model-runner.docker.internal/engines/v1',
 *   model: DOCKER_MODELS.QWEN,
 * });
 * ```
 */
export function createDockerModelProvider(
  config: DockerModelConfig,
): AIProvider {
  // Validate configuration
  validateDockerConfig(config, 'model');

  const docker = createOpenAICompatible({
    name: 'docker-model-runner',
    baseURL: config.baseUrl,
    // Docker Model Runner doesn't require authentication
    headers: {},
  });

  const providerConfig: AIProviderConfig = {
    name: 'docker',
    baseUrl: config.baseUrl,
    model: config.model,
  };

  console.log(
    `[Docker Provider] Initialized model provider: ${config.model} at ${config.baseUrl}`,
  );

  return {
    name: 'docker',
    model: docker.chatModel(config.model),
    config: providerConfig,
    supportsStructuredOutput: false,
  };
}

/**
 * Create a Docker Model Runner embedding provider
 *
 * @example
 * ```ts
 * // Use environment variables (recommended)
 * const embedder = createDockerEmbeddingProvider({
 *   baseUrl: process.env.EMBEDDING_MODEL_URL!,
 *   model: process.env.EMBEDDING_MODEL_NAME!,
 * });
 * ```
 */
export function createDockerEmbeddingProvider(config: DockerModelConfig) {
  // Validate configuration
  validateDockerConfig(config, 'embedding');

  const docker = createOpenAICompatible({
    name: 'docker-model-runner-embedding',
    baseURL: config.baseUrl,
    headers: {},
  });

  console.log(
    `[Docker Provider] Initialized embedding provider: ${config.model} at ${config.baseUrl}`,
  );

  return {
    name: 'docker',
    model: docker.embeddingModel(config.model),
    config: {
      name: 'docker',
      baseUrl: config.baseUrl,
      model: config.model,
    },
  };
}
