/**
 * @pharmabroker/ai-playground
 *
 * AI testing, evaluation, and benchmarking tools.
 *
 * @example
 * ```bash
 * # Interactive playground
 * bun run --filter @pharmabroker/ai-playground play
 *
 * # Run benchmarks
 * bun run --filter @pharmabroker/ai-playground bench
 *
 * # Evaluate accuracy
 * bun run --filter @pharmabroker/ai-playground eval
 *
 * # Compare providers
 * bun run --filter @pharmabroker/ai-playground compare
 * ```
 */

// Types
export type {
  TestCase,
  TestSuite,
  ExpectedExtraction,
  EvaluationResult,
  EvaluationMetrics,
  ExtractionComparison,
  FieldMismatch,
  AggregatedMetrics,
  BenchmarkConfig,
  BenchmarkResult,
  BenchmarkCaseResult,
  ProviderComparisonResult,
} from './types';

// Test Suites
export {
  allSuites,
  getSuite,
  getCasesByTag,
  basicTextSuite,
  orderExtractionSuite,
  intentClassificationSuite,
  sentimentAnalysisSuite,
  entityExtractionSuite,
  complexScenariosSuite,
} from './test-suites';

// Evaluator
export { Evaluator, evaluator } from './evaluator';

// Runner
export {
  TestRunner,
  BenchmarkRunner,
  createTestRunner,
  createBenchmarkRunner,
  type RunOptions,
} from './runner';

// Reporter
export { Reporter, reporter } from './reporter';
