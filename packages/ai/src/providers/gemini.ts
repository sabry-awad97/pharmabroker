/**
 * Gemini Provider
 *
 * Uses @ai-sdk/google for native Gemini API support.
 */

import { createGoogleGenerativeAI } from '@ai-sdk/google';
import type { AIProvider, AIProviderConfig } from '../types';

export interface GeminiConfig {
  apiKey: string;
  model?: string;
}

/**
 * Create a Gemini provider instance
 */
export function createGeminiProvider(config: GeminiConfig): AIProvider {
  const model = config.model ?? 'gemini-2.0-flash';

  const google = createGoogleGenerativeAI({
    apiKey: config.apiKey,
  });

  const providerConfig: AIProviderConfig = {
    name: 'gemini',
    baseUrl: 'https://generativelanguage.googleapis.com',
    apiKey: config.apiKey,
    model,
  };

  return {
    name: 'gemini',
    model: google(model),
    config: providerConfig,
    supportsStructuredOutput: true,
  };
}
