/**
 * AI Evaluator
 *
 * Evaluates AI extraction results against expected outputs.
 */

import type {
  MessageInput,
  ProcessingResult,
  ExtractionResult,
} from '@pharmabroker/ai';
import type {
  TestCase,
  TestSuite,
  EvaluationResult,
  EvaluationMetrics,
  ExtractionComparison,
  FieldMismatch,
  AggregatedMetrics,
  ExpectedExtraction,
} from './types';

// ============================================================================
// Evaluator Class
// ============================================================================

export class Evaluator {
  /**
   * Evaluate a single test case result
   */
  evaluateCase(testCase: TestCase, result: ProcessingResult): EvaluationResult {
    const comparisons = this.compareExtractions(
      testCase.expected ?? [],
      result.extractions,
    );

    const matchedCount = comparisons.filter(c => c.matched).length;
    const expectedCount = testCase.expected?.length ?? 0;
    const actualCount = result.extractions.length;

    const precision = actualCount > 0 ? matchedCount / actualCount : 1;
    const recall = expectedCount > 0 ? matchedCount / expectedCount : 1;
    const f1Score =
      precision + recall > 0
        ? (2 * precision * recall) / (precision + recall)
        : 0;

    const metrics: EvaluationMetrics = {
      latencyMs: result.processingTimeMs,
      expectedCount,
      matchedCount,
      precision,
      recall,
      f1Score,
    };

    const passed = expectedCount === 0 || matchedCount === expectedCount;

    return {
      testCase,
      processingResult: result,
      passed,
      comparisons,
      metrics,
    };
  }

  /**
   * Compare expected extractions with actual results
   */
  private compareExtractions(
    expected: ExpectedExtraction[],
    actual: ExtractionResult[],
  ): ExtractionComparison[] {
    return expected.map(exp => {
      // Find matching extraction by type
      const match = actual.find(act => act.type === exp.type);

      if (!match) {
        return {
          expected: exp,
          actual: null,
          matched: false,
          mismatches: [{ field: 'type', expected: exp.type, actual: null }],
        };
      }

      // Check confidence threshold
      if (
        exp.minConfidence !== undefined &&
        match.confidence < exp.minConfidence
      ) {
        return {
          expected: exp,
          actual: match,
          matched: false,
          mismatches: [
            {
              field: 'confidence',
              expected: `>= ${exp.minConfidence}`,
              actual: match.confidence,
            },
          ],
        };
      }

      // Compare data fields
      const mismatches = this.compareData(
        exp.data,
        match.data as Record<string, unknown>,
      );

      return {
        expected: exp,
        actual: match,
        matched: mismatches.length === 0,
        mismatches,
      };
    });
  }

  /**
   * Compare expected data with actual data (partial match)
   */
  private compareData(
    expected: Record<string, unknown>,
    actual: Record<string, unknown>,
  ): FieldMismatch[] {
    const mismatches: FieldMismatch[] = [];

    for (const [key, expectedValue] of Object.entries(expected)) {
      const actualValue = actual[key];

      if (!this.valuesMatch(expectedValue, actualValue)) {
        mismatches.push({
          field: key,
          expected: expectedValue,
          actual: actualValue,
        });
      }
    }

    return mismatches;
  }

  /**
   * Check if two values match (supports partial array matching)
   */
  private valuesMatch(expected: unknown, actual: unknown): boolean {
    if (expected === actual) return true;
    if (expected === null || actual === null) return expected === actual;
    if (expected === undefined || actual === undefined)
      return expected === actual;

    // Array comparison (partial match - all expected items must be in actual)
    if (Array.isArray(expected) && Array.isArray(actual)) {
      return expected.every(expItem =>
        actual.some(actItem => this.valuesMatch(expItem, actItem)),
      );
    }

    // Object comparison (partial match)
    if (typeof expected === 'object' && typeof actual === 'object') {
      const expObj = expected as Record<string, unknown>;
      const actObj = actual as Record<string, unknown>;

      return Object.entries(expObj).every(([key, value]) =>
        this.valuesMatch(value, actObj[key]),
      );
    }

    // String comparison (case-insensitive contains)
    if (typeof expected === 'string' && typeof actual === 'string') {
      return actual.toLowerCase().includes(expected.toLowerCase());
    }

    return false;
  }

  /**
   * Aggregate metrics from multiple evaluation results
   */
  aggregateMetrics(results: EvaluationResult[]): AggregatedMetrics {
    if (results.length === 0) {
      return {
        totalCases: 0,
        passedCases: 0,
        passRate: 0,
        avgLatencyMs: 0,
        p50LatencyMs: 0,
        p95LatencyMs: 0,
        p99LatencyMs: 0,
        avgPrecision: 0,
        avgRecall: 0,
        avgF1Score: 0,
      };
    }

    const latencies = results
      .map(r => r.metrics.latencyMs)
      .sort((a, b) => a - b);
    const passedCases = results.filter(r => r.passed).length;

    return {
      totalCases: results.length,
      passedCases,
      passRate: passedCases / results.length,
      avgLatencyMs: latencies.reduce((a, b) => a + b, 0) / latencies.length,
      p50LatencyMs: this.percentile(latencies, 50),
      p95LatencyMs: this.percentile(latencies, 95),
      p99LatencyMs: this.percentile(latencies, 99),
      avgPrecision:
        results.reduce((a, r) => a + r.metrics.precision, 0) / results.length,
      avgRecall:
        results.reduce((a, r) => a + r.metrics.recall, 0) / results.length,
      avgF1Score:
        results.reduce((a, r) => a + r.metrics.f1Score, 0) / results.length,
    };
  }

  /**
   * Calculate percentile from sorted array
   */
  private percentile(sorted: number[], p: number): number {
    if (sorted.length === 0) return 0;
    const index = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.max(0, Math.min(index, sorted.length - 1))]!;
  }
}

// ============================================================================
// Singleton Export
// ============================================================================

export const evaluator = new Evaluator();
