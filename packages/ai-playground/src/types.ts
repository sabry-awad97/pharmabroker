/**
 * AI Playground Types
 *
 * Type definitions for testing, evaluation, and benchmarking.
 */

import type {
  AIProviderName,
  ProcessingResult,
  ExtractionResult,
} from '@pharmabroker/ai';

// ============================================================================
// Test Case Types
// ============================================================================

/** A test case for AI evaluation */
export interface TestCase {
  id: string;
  name: string;
  description?: string;
  input: {
    text: string;
    senderName?: string;
    groupName?: string;
    context?: string[];
  };
  /** Expected extractions for evaluation */
  expected?: ExpectedExtraction[];
  /** Tags for filtering test cases */
  tags?: string[];
}

/** Expected extraction for comparison */
export interface ExpectedExtraction {
  type: string;
  /** Partial match - only specified fields are compared */
  data: Record<string, unknown>;
  /** Minimum confidence threshold */
  minConfidence?: number;
}

/** Test suite containing multiple test cases */
export interface TestSuite {
  name: string;
  description?: string;
  cases: TestCase[];
}

// ============================================================================
// Evaluation Types
// ============================================================================

/** Result of evaluating a single test case */
export interface EvaluationResult {
  testCase: TestCase;
  processingResult: ProcessingResult;
  /** Whether all expected extractions were found */
  passed: boolean;
  /** Detailed comparison results */
  comparisons: ExtractionComparison[];
  /** Evaluation metrics */
  metrics: EvaluationMetrics;
}

/** Comparison between expected and actual extraction */
export interface ExtractionComparison {
  expected: ExpectedExtraction;
  actual: ExtractionResult | null;
  matched: boolean;
  /** Fields that didn't match */
  mismatches: FieldMismatch[];
}

/** A field that didn't match between expected and actual */
export interface FieldMismatch {
  field: string;
  expected: unknown;
  actual: unknown;
}

/** Metrics for a single evaluation */
export interface EvaluationMetrics {
  /** Processing time in milliseconds */
  latencyMs: number;
  /** Number of expected extractions */
  expectedCount: number;
  /** Number of matched extractions */
  matchedCount: number;
  /** Precision: matched / actual */
  precision: number;
  /** Recall: matched / expected */
  recall: number;
  /** F1 score: harmonic mean of precision and recall */
  f1Score: number;
}

/** Aggregated metrics across multiple evaluations */
export interface AggregatedMetrics {
  /** Total test cases */
  totalCases: number;
  /** Passed test cases */
  passedCases: number;
  /** Pass rate */
  passRate: number;
  /** Average latency */
  avgLatencyMs: number;
  /** P50 latency */
  p50LatencyMs: number;
  /** P95 latency */
  p95LatencyMs: number;
  /** P99 latency */
  p99LatencyMs: number;
  /** Average precision */
  avgPrecision: number;
  /** Average recall */
  avgRecall: number;
  /** Average F1 score */
  avgF1Score: number;
}

// ============================================================================
// Benchmark Types
// ============================================================================

/** Configuration for a benchmark run */
export interface BenchmarkConfig {
  /** Number of iterations per test case */
  iterations: number;
  /** Warmup iterations (not counted) */
  warmupIterations: number;
  /** Concurrent requests */
  concurrency: number;
  /** Provider to benchmark */
  provider: AIProviderName;
}

/** Result of a benchmark run */
export interface BenchmarkResult {
  config: BenchmarkConfig;
  /** Results per test case */
  caseResults: BenchmarkCaseResult[];
  /** Aggregated metrics */
  aggregated: AggregatedMetrics;
  /** Total benchmark duration */
  totalDurationMs: number;
}

/** Benchmark result for a single test case */
export interface BenchmarkCaseResult {
  testCase: TestCase;
  /** Latencies for each iteration */
  latencies: number[];
  /** Errors encountered */
  errors: string[];
  /** Success rate */
  successRate: number;
}

// ============================================================================
// Provider Comparison Types
// ============================================================================

/** Result of comparing multiple providers */
export interface ProviderComparisonResult {
  testSuite: TestSuite;
  /** Results per provider */
  providerResults: Map<AIProviderName, AggregatedMetrics>;
  /** Winner for each metric */
  winners: {
    latency: AIProviderName;
    precision: AIProviderName;
    recall: AIProviderName;
    f1Score: AIProviderName;
    passRate: AIProviderName;
  };
}
