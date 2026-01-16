/**
 * @pharmabroker/ai-playground
 *
 * AI testing, evaluation, and benchmarking tools for pharmaceutical message extraction.
 *
 * @example
 * ```bash
 * # Interactive playground
 * bun run src/cli.ts
 *
 * # Extract from test messages
 * bun run src/cli.ts extract docker
 *
 * # Interactive chat
 * bun run src/cli.ts chat docker
 * ```
 */

// Re-export schemas from @pharmabroker/schemas
export {
  medicationSchema,
  messageExtractionSchema,
  type Medication,
  type MessageExtraction,
} from '@pharmabroker/schemas/ai';

// Prompts
export { medicationSystemPrompt, medicationPromptTemplate } from './prompts';

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
