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
 */

import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import type { AIProvider, AIProviderConfig } from '../types';

export interface DockerModelConfig {
  /** Base URL for the Docker Model Runner API */
  baseUrl?: string;
  /** Model identifier (e.g., 'ai/qwen3-vl') */
  model?: string;
}

/** Available Docker Model Runner models */
export const DOCKER_MODELS = {
  QWEN: 'ai/qwen3-vl',
  MINISTRAL: 'ai/ministral3',
  GEMMA: 'ai/gemma3',
  EMBEDDING: 'ai/embeddinggemma',
} as const;

/**
 * Create a Docker Model Runner provider instance
 *
 * @example
 * ```ts
 * // Use environment-injected config (recommended in Docker)
 * const provider = createDockerModelProvider({
 *   baseUrl: process.env.DOCKER_MODEL_BASE_URL,
 *   model: process.env.DOCKER_MODEL_NAME,
 * });
 *
 * // Use specific model
 * const provider = createDockerModelProvider({
 *   model: DOCKER_MODELS.GEMMA,
 * });
 * ```
 */
export function createDockerModelProvider(
  config: DockerModelConfig = {},
): AIProvider {
  const baseUrl =
    config.baseUrl ?? 'http://model-runner.docker.internal/engines/v1';
  const model = config.model ?? DOCKER_MODELS.QWEN;

  const docker = createOpenAICompatible({
    name: 'docker-model-runner',
    baseURL: baseUrl,
    // Docker Model Runner doesn't require authentication
    headers: {},
  });

  const providerConfig: AIProviderConfig = {
    name: 'docker',
    baseUrl,
    model,
  };

  return {
    name: 'docker',
    model: docker.chatModel(model),
    config: providerConfig,
    supportsStructuredOutput: false,
  };
}

/**
 * Create a Docker Model Runner embedding provider
 *
 * @example
 * ```ts
 * const embedder = createDockerEmbeddingProvider({
 *   baseUrl: process.env.EMBEDDING_MODEL_URL,
 *   model: process.env.EMBEDDING_MODEL_NAME,
 * });
 * ```
 */
export function createDockerEmbeddingProvider(config: DockerModelConfig = {}) {
  const baseUrl =
    config.baseUrl ?? 'http://model-runner.docker.internal/engines/v1';
  const model = config.model ?? DOCKER_MODELS.EMBEDDING;

  const docker = createOpenAICompatible({
    name: 'docker-model-runner-embedding',
    baseURL: baseUrl,
    headers: {},
  });

  return {
    name: 'docker',
    model: docker.embeddingModel(model),
    config: {
      name: 'docker',
      baseUrl,
      model,
    },
  };
}
