/**
 * Test Runner
 *
 * Runs test suites against AI providers and collects results.
 */

import {
  createAIClient,
  type AIClient,
  type AIProviderName,
  type AIEnvConfig,
  type MessageInput,
  type ProcessingResult,
} from '@pharmabroker/ai';
import type {
  TestCase,
  TestSuite,
  EvaluationResult,
  AggregatedMetrics,
  BenchmarkConfig,
  BenchmarkResult,
  BenchmarkCaseResult,
} from './types';
import { evaluator } from './evaluator';
import { env } from './env';

// Create env config from playground's minimal env
const envConfig: AIEnvConfig = {
  AI_PROVIDER: env.AI_PROVIDER,
  GEMINI_API_KEY: env.GEMINI_API_KEY,
  GEMINI_MODEL: env.GEMINI_MODEL,
  OLLAMA_BASE_URL: env.OLLAMA_BASE_URL,
  OLLAMA_MODEL: env.OLLAMA_MODEL,
  OPENAI_API_KEY: env.OPENAI_API_KEY,
  OPENAI_BASE_URL: env.OPENAI_BASE_URL,
  OPENAI_MODEL: env.OPENAI_MODEL,
  DOCKER_MODEL_BASE_URL: env.DOCKER_MODEL_BASE_URL,
  DOCKER_MODEL_NAME: env.DOCKER_MODEL_NAME,
};

// ============================================================================
// Test Runner
// ============================================================================

export interface RunOptions {
  /** Provider to use */
  provider?: AIProviderName;
  /** Filter by tags */
  tags?: string[];
  /** Verbose output */
  verbose?: boolean;
  /** Progress callback */
  onProgress?: (current: number, total: number, testCase: TestCase) => void;
}

export class TestRunner {
  private client: AIClient;

  constructor(provider?: AIProviderName) {
    this.client = createAIClient({ provider, envConfig });
  }

  /**
   * Run a single test case
   */
  async runCase(testCase: TestCase): Promise<EvaluationResult> {
    const input: MessageInput = {
      id: testCase.id,
      text: testCase.input.text,
      senderName: testCase.input.senderName,
      groupName: testCase.input.groupName,
      timestamp: new Date(),
      context: testCase.input.context,
    };

    const result = await this.client.processMessage(input);
    return evaluator.evaluateCase(testCase, result);
  }

  /**
   * Run a test suite
   */
  async runSuite(
    suite: TestSuite,
    options: RunOptions = {},
  ): Promise<{ results: EvaluationResult[]; aggregated: AggregatedMetrics }> {
    let cases = suite.cases;

    // Filter by tags if specified
    if (options.tags && options.tags.length > 0) {
      cases = cases.filter(c => c.tags?.some(t => options.tags!.includes(t)));
    }

    const results: EvaluationResult[] = [];

    for (let i = 0; i < cases.length; i++) {
      const testCase = cases[i]!;

      if (options.onProgress) {
        options.onProgress(i + 1, cases.length, testCase);
      }

      const result = await this.runCase(testCase);
      results.push(result);
    }

    const aggregated = evaluator.aggregateMetrics(results);

    return { results, aggregated };
  }

  /**
   * Run multiple test suites
   */
  async runSuites(
    suites: TestSuite[],
    options: RunOptions = {},
  ): Promise<
    Map<string, { results: EvaluationResult[]; aggregated: AggregatedMetrics }>
  > {
    const allResults = new Map<
      string,
      { results: EvaluationResult[]; aggregated: AggregatedMetrics }
    >();

    for (const suite of suites) {
      const suiteResults = await this.runSuite(suite, options);
      allResults.set(suite.name, suiteResults);
    }

    return allResults;
  }

  /**
   * Get the current provider name
   */
  get providerName(): AIProviderName {
    return this.client.providerName;
  }

  /**
   * Get the current model name
   */
  get modelName(): string {
    return this.client.modelName;
  }
}

// ============================================================================
// Benchmark Runner
// ============================================================================

export class BenchmarkRunner {
  /**
   * Run a benchmark
   */
  async run(
    suite: TestSuite,
    config: BenchmarkConfig,
  ): Promise<BenchmarkResult> {
    const startTime = Date.now();
    const client = createAIClient({ provider: config.provider, envConfig });
    const caseResults: BenchmarkCaseResult[] = [];

    for (const testCase of suite.cases) {
      const latencies: number[] = [];
      const errors: string[] = [];

      // Warmup
      for (let i = 0; i < config.warmupIterations; i++) {
        try {
          await this.runSingleIteration(client, testCase);
        } catch (error) {
          // Ignore warmup errors
        }
      }

      // Actual benchmark
      for (let i = 0; i < config.iterations; i++) {
        try {
          const result = await this.runSingleIteration(client, testCase);
          latencies.push(result.processingTimeMs);
        } catch (error) {
          errors.push(error instanceof Error ? error.message : String(error));
        }
      }

      const successRate = latencies.length / config.iterations;

      caseResults.push({
        testCase,
        latencies,
        errors,
        successRate,
      });
    }

    // Build evaluation results for aggregation
    const allResults = caseResults.map(r => ({
      testCase: r.testCase,
      processingResult: {
        messageId: r.testCase.id,
        status: 'completed' as const,
        model: client.modelName,
        extractions: [],
        processingTimeMs:
          r.latencies.length > 0
            ? r.latencies.reduce((a, b) => a + b, 0) / r.latencies.length
            : 0,
      },
      passed: r.successRate > 0.9,
      comparisons: [],
      metrics: {
        latencyMs:
          r.latencies.length > 0
            ? r.latencies.reduce((a, b) => a + b, 0) / r.latencies.length
            : 0,
        expectedCount: 0,
        matchedCount: 0,
        precision: 1,
        recall: 1,
        f1Score: 1,
      },
    }));

    const aggregated = evaluator.aggregateMetrics(allResults);

    return {
      config,
      caseResults,
      aggregated,
      totalDurationMs: Date.now() - startTime,
    };
  }

  private async runSingleIteration(
    client: AIClient,
    testCase: TestCase,
  ): Promise<ProcessingResult> {
    const input: MessageInput = {
      id: testCase.id,
      text: testCase.input.text,
      senderName: testCase.input.senderName,
      groupName: testCase.input.groupName,
      timestamp: new Date(),
    };

    return client.processMessage(input);
  }
}

// ============================================================================
// Exports
// ============================================================================

export function createTestRunner(provider?: AIProviderName): TestRunner {
  return new TestRunner(provider);
}

export function createBenchmarkRunner(): BenchmarkRunner {
  return new BenchmarkRunner();
}
