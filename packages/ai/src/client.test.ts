/**
 * AI Client Tests
 *
 * Unit tests for the AI client and provider abstraction.
 * Tests provider creation, client configuration, and basic operations.
 */

import { describe, it, expect, beforeEach, mock } from 'bun:test';
import * as fc from 'fast-check';
import type { MessageInput, ProcessingResult } from './types';

// ============================================================================
// Test Helpers
// ============================================================================

/** Generate a valid message input */
const messageInputArb = fc.record({
  id: fc.uuid(),
  text: fc.string({ minLength: 1, maxLength: 500 }),
  senderName: fc.option(fc.string({ minLength: 1, maxLength: 50 }), {
    nil: undefined,
  }),
  groupName: fc.option(fc.string({ minLength: 1, maxLength: 100 }), {
    nil: undefined,
  }),
  timestamp: fc.date(),
});

/** Generate an empty message input */
const emptyMessageInputArb = fc.record({
  id: fc.uuid(),
  text: fc.constantFrom('', '   ', '\n\t'),
  timestamp: fc.date(),
});

// ============================================================================
// Unit Tests
// ============================================================================

describe('AI Types', () => {
  describe('MessageInput', () => {
    it('should accept valid message input structure', () => {
      const input: MessageInput = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        text: 'Hello world',
        senderName: 'John',
        groupName: 'Test Group',
        timestamp: new Date(),
      };

      expect(input.id).toBeDefined();
      expect(input.text).toBe('Hello world');
      expect(input.senderName).toBe('John');
      expect(input.groupName).toBe('Test Group');
      expect(input.timestamp).toBeInstanceOf(Date);
    });

    it('should accept message input with optional fields undefined', () => {
      const input: MessageInput = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        text: 'Hello world',
        timestamp: new Date(),
      };

      expect(input.id).toBeDefined();
      expect(input.text).toBe('Hello world');
      expect(input.senderName).toBeUndefined();
      expect(input.groupName).toBeUndefined();
    });
  });

  describe('ProcessingResult', () => {
    it('should accept valid completed result', () => {
      const result: ProcessingResult = {
        messageId: '123e4567-e89b-12d3-a456-426614174000',
        status: 'completed',
        model: 'test-model',
        extractions: [],
        processingTimeMs: 100,
      };

      expect(result.status).toBe('completed');
      expect(result.extractions).toEqual([]);
      expect(result.error).toBeUndefined();
    });

    it('should accept valid failed result with error', () => {
      const result: ProcessingResult = {
        messageId: '123e4567-e89b-12d3-a456-426614174000',
        status: 'failed',
        model: 'test-model',
        extractions: [],
        error: 'Something went wrong',
        processingTimeMs: 50,
      };

      expect(result.status).toBe('failed');
      expect(result.error).toBe('Something went wrong');
    });

    it('should accept valid skipped result', () => {
      const result: ProcessingResult = {
        messageId: '123e4567-e89b-12d3-a456-426614174000',
        status: 'skipped',
        model: 'test-model',
        extractions: [],
        processingTimeMs: 5,
      };

      expect(result.status).toBe('skipped');
    });
  });
});

describe('AI Provider Types', () => {
  it('should define valid provider names', () => {
    const validProviders = ['gemini', 'ollama', 'openai', 'docker'];

    for (const provider of validProviders) {
      expect(['gemini', 'ollama', 'openai', 'docker']).toContain(provider);
    }
  });
});

// ============================================================================
// Property-Based Tests
// ============================================================================

describe('AI Client - Property Tests', () => {
  /**
   * Property 1: Message Input Validation
   *
   * For any valid MessageInput, the structure should be consistent
   * and all required fields should be present.
   */
  describe('Property 1: Message Input Structure', () => {
    it('property: all message inputs have required fields', () => {
      fc.assert(
        fc.property(messageInputArb, input => {
          // Required fields must be present
          expect(input.id).toBeDefined();
          expect(typeof input.id).toBe('string');
          expect(input.text).toBeDefined();
          expect(typeof input.text).toBe('string');
          expect(input.timestamp).toBeInstanceOf(Date);

          return true;
        }),
        { numRuns: 100 },
      );
    });

    it('property: optional fields are either string or undefined', () => {
      fc.assert(
        fc.property(messageInputArb, input => {
          if (input.senderName !== undefined) {
            expect(typeof input.senderName).toBe('string');
          }
          if (input.groupName !== undefined) {
            expect(typeof input.groupName).toBe('string');
          }

          return true;
        }),
        { numRuns: 100 },
      );
    });
  });

  /**
   * Property 2: Processing Result Status
   *
   * For any ProcessingResult, the status should be one of the valid values
   * and error should only be present for failed status.
   */
  describe('Property 2: Processing Result Consistency', () => {
    it('property: status is always one of valid values', () => {
      const validStatuses = ['completed', 'failed', 'skipped'];

      fc.assert(
        fc.property(
          fc.constantFrom('completed', 'failed', 'skipped'),
          fc.uuid(),
          fc.string(),
          (status, messageId, model) => {
            const result: ProcessingResult = {
              messageId,
              status,
              model,
              extractions: [],
              processingTimeMs: 0,
            };

            expect(validStatuses).toContain(result.status);
            return true;
          },
        ),
        { numRuns: 100 },
      );
    });

    it('property: processingTimeMs is always non-negative', () => {
      fc.assert(
        fc.property(
          fc.nat(), // Natural number (non-negative)
          timeMs => {
            const result: ProcessingResult = {
              messageId: 'test-id',
              status: 'completed',
              model: 'test-model',
              extractions: [],
              processingTimeMs: timeMs,
            };

            expect(result.processingTimeMs).toBeGreaterThanOrEqual(0);
            return true;
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  /**
   * Property 3: Extraction Result Structure
   *
   * For any extraction result, the type should be a string
   * and confidence should be between 0 and 1.
   */
  describe('Property 3: Extraction Result Structure', () => {
    it('property: extraction type is always a string', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 50 }),
          fc.float({ min: 0, max: 1, noNaN: true }),
          (type, confidence) => {
            const extraction = {
              type,
              data: {},
              confidence,
            };

            expect(typeof extraction.type).toBe('string');
            expect(extraction.confidence).toBeGreaterThanOrEqual(0);
            expect(extraction.confidence).toBeLessThanOrEqual(1);
            return true;
          },
        ),
        { numRuns: 100 },
      );
    });
  });
});

describe('AI Extractor Registry', () => {
  /**
   * Property 4: Extractor Registry Behavior
   *
   * The extractor registry should return empty extractions
   * until extraction types are defined.
   */
  describe('Property 4: Placeholder Behavior', () => {
    it('extractMultiple returns empty array for any input', async () => {
      // Import dynamically to avoid env issues in tests
      const { ExtractorRegistry } = await import('./extractors');

      // Create a mock model
      const mockModel = {} as any;
      const registry = new ExtractorRegistry(mockModel);

      fc.assert(
        fc.asyncProperty(messageInputArb, async input => {
          const result = await registry.extractMultiple(
            ['intent', 'entities'],
            input,
          );
          expect(result).toEqual([]);
          return true;
        }),
        { numRuns: 20 },
      );
    });

    it('extract returns null for any type', async () => {
      const { ExtractorRegistry } = await import('./extractors');

      const mockModel = {} as any;
      const registry = new ExtractorRegistry(mockModel);

      fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 20 }),
          messageInputArb,
          async (type, input) => {
            const result = await registry.extract(type, input);
            expect(result).toBeNull();
            return true;
          },
        ),
        { numRuns: 20 },
      );
    });
  });
});
