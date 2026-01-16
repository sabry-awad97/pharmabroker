/**
 * AI Extractors
 *
 * Placeholder extraction module - will be implemented when data shapes are defined.
 */

import type { LanguageModel } from 'ai';
import type { ExtractionType, MessageInput, ExtractionResult } from '../types';

/**
 * Extractor registry for managing multiple extractors
 *
 * Currently a placeholder - extraction logic will be added when
 * the data shapes are defined.
 */
export class ExtractorRegistry {
  constructor(private model: LanguageModel) {}

  /**
   * Run a specific extractor on a message
   * @returns null - placeholder until extraction types are defined
   */
  async extract(
    _type: ExtractionType,
    _message: MessageInput,
  ): Promise<ExtractionResult | null> {
    // Placeholder - will implement when data shapes are defined
    return null;
  }

  /**
   * Run multiple extractors on a message
   * @returns empty array - placeholder until extraction types are defined
   */
  async extractMultiple(
    _types: ExtractionType[],
    _message: MessageInput,
  ): Promise<ExtractionResult[]> {
    // Placeholder - will implement when data shapes are defined
    return [];
  }

  /**
   * Run all applicable extractors on a message
   */
  async extractAll(message: MessageInput): Promise<ExtractionResult[]> {
    return this.extractMultiple([], message);
  }

  /** Get the underlying model */
  getModel(): LanguageModel {
    return this.model;
  }
}

/**
 * Create an extractor registry
 */
export function createExtractorRegistry(
  model: LanguageModel,
): ExtractorRegistry {
  return new ExtractorRegistry(model);
}
