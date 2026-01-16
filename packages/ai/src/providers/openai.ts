/**
 * OpenAI Provider
 *
 * Uses @ai-sdk/openai for native OpenAI API support.
 */

import { createOpenAI } from '@ai-sdk/openai';
import type { AIProvider, AIProviderConfig } from '../types';

export interface OpenAIConfig {
  apiKey: string;
  baseUrl?: string;
  model?: string;
}

/**
 * Create an OpenAI provider instance
 *
 * @example
 * ```ts
 * const provider = createOpenAIProvider({
 *   apiKey: process.env.OPENAI_API_KEY,
 *   model: 'gpt-4o-mini',
 * });
 * ```
 */
export function createOpenAIProvider(config: OpenAIConfig): AIProvider {
  const baseUrl = config.baseUrl ?? 'https://api.openai.com/v1';
  const model = config.model ?? 'gpt-4o-mini';

  const openai = createOpenAI({
    apiKey: config.apiKey,
    baseURL: baseUrl,
  });

  const providerConfig: AIProviderConfig = {
    name: 'openai',
    baseUrl,
    apiKey: config.apiKey,
    model,
  };

  return {
    name: 'openai',
    model: openai(model),
    config: providerConfig,
    supportsStructuredOutput: true,
  };
}
