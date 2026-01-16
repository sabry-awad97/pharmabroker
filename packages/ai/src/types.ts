/**
 * AI Package Types
 *
 * Core type definitions for the AI abstraction layer.
 */

import type { LanguageModel } from 'ai';

// ============================================================================
// Provider Types
// ============================================================================

/** Supported AI provider names */
export type AIProviderName = 'gemini' | 'ollama' | 'openai' | 'docker';

/** Provider configuration */
export interface AIProviderConfig {
  name: AIProviderName;
  baseUrl: string;
  apiKey?: string;
  model: string;
}

/** Provider instance with model */
export interface AIProvider {
  name: AIProviderName;
  model: LanguageModel;
  config: AIProviderConfig;
}

// ============================================================================
// Extraction Types
// ============================================================================

/** Types of data that can be extracted from messages */
export type ExtractionType = string;

/** Base extraction result */
export interface ExtractionResult {
  type: ExtractionType;
  data: unknown;
  confidence: number;
}

// ============================================================================
// Processing Types
// ============================================================================

/** Message input for AI processing */
export interface MessageInput {
  id: string;
  text: string;
  senderName?: string;
  groupName?: string;
  timestamp: Date;
  context?: string[];
}

/** AI processing result */
export interface ProcessingResult {
  messageId: string;
  status: 'completed' | 'failed' | 'skipped';
  model: string;
  extractions: ExtractionResult[];
  error?: string;
  processingTimeMs: number;
}

/** Batch processing options */
export interface BatchOptions {
  concurrency?: number;
  retryOnError?: boolean;
  maxRetries?: number;
  skipOnError?: boolean;
}
