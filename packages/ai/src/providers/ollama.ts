/**
 * Ollama Provider
 *
 * Uses ollama-ai-provider-v2 for native Ollama support.
 */

import { createOllama } from 'ollama-ai-provider-v2';
import type { AIProvider, AIProviderConfig } from '../types';

export interface OllamaConfig {
  baseUrl?: string;
  model?: string;
}

/**
 * Create an Ollama provider instance
 */
export function createOllamaProvider(config: OllamaConfig = {}): AIProvider {
  const baseUrl = config.baseUrl ?? 'http://localhost:11434';
  const model = config.model ?? 'llama3.2';

  const ollama = createOllama({
    baseURL: `${baseUrl}/api`,
  });

  const providerConfig: AIProviderConfig = {
    name: 'ollama',
    baseUrl,
    model,
  };

  return {
    name: 'ollama',
    model: ollama(model),
    config: providerConfig,
  };
}
