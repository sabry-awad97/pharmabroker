/**
 * Test Runner
 *
 * Runs test suites against AI providers and collects results.
 */

import { z } from 'zod';
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

// Default schema for message analysis
const messageAnalysisSchema = z.object({
  intent: z.object({
    type: z
      .string()
      .describe(
        'The primary intent: order, inquiry, complaint, greeting, support, other',
      ),
    confidence: z.number().min(0).max(1).describe('Confidence score 0-1'),
  }),
  sentiment: z.object({
    label: z
      .enum(['positive', 'negative', 'neutral'])
      .describe('Overall sentiment'),
    score: z.number().min(-1).max(1).describe('Sentiment score from -1 to 1'),
  }),
  entities: z
    .array(
      z.object({
        type: z
          .string()
          .describe(
            'Entity type: product, quantity, price, date, person, location, phone, email',
          ),
        value: z.string().describe('The extracted value'),
        confidence: z.number().min(0).max(1).describe('Confidence score 0-1'),
      }),
    )
    .describe('Extracted entities from the message'),
  summary: z
    .string()
    .nullable()
    .describe('Brief summary if message is complex'),
});

type MessageAnalysis = z.infer<typeof messageAnalysisSchema>;

const defaultSystemPrompt = `You are an AI assistant specialized in analyzing WhatsApp messages for a pharmaceutical distribution company.
Extract structured information including intent, sentiment, and entities.
For confidence scores: 0.9+ for clear cases, 0.7-0.9 for likely cases, below 0.7 for uncertain.`;

const defaultPromptTemplate = `Analyze this WhatsApp message:
{{context}}

Message: "{{message}}"

Extract the intent, sentiment, and any relevant entities.`;

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

    const result = await this.client.processMessage(input, {
      schema: messageAnalysisSchema,
      systemPrompt: defaultSystemPrompt,
      promptTemplate: defaultPromptTemplate,
    });

    // Convert structured data to extractions for evaluation
    const processingResult: ProcessingResult = {
      messageId: result.messageId,
      status: result.status,
      model: result.model,
      extractions: result.data ? this.convertToExtractions(result.data) : [],
      error: result.error,
      processingTimeMs: result.processingTimeMs,
    };

    return evaluator.evaluateCase(testCase, processingResult);
  }

  /**
   * Convert structured analysis to extraction results
   */
  private convertToExtractions(
    data: MessageAnalysis,
  ): ProcessingResult['extractions'] {
    const extractions: ProcessingResult['extractions'] = [];

    // Add intent
    extractions.push({
      type: 'intent',
      data: { intent: data.intent.type },
      confidence: data.intent.confidence,
    });

    // Add sentiment
    extractions.push({
      type: 'sentiment',
      data: { sentiment: data.sentiment.label, score: data.sentiment.score },
      confidence: Math.abs(data.sentiment.score) > 0.5 ? 0.9 : 0.7,
    });

    // Add entities
    for (const entity of data.entities) {
      extractions.push({
        type: `entity:${entity.type}`,
        data: { value: entity.value },
        confidence: entity.confidence,
      });
    }

    // Add summary if present
    if (data.summary) {
      extractions.push({
        type: 'summary',
        data: { text: data.summary },
        confidence: 0.9,
      });
    }

    return extractions;
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

    const result = await client.processMessage(input, {
      schema: messageAnalysisSchema,
      systemPrompt: defaultSystemPrompt,
      promptTemplate: defaultPromptTemplate,
    });

    return {
      messageId: result.messageId,
      status: result.status,
      model: result.model,
      extractions: result.extractions,
      error: result.error,
      processingTimeMs: result.processingTimeMs,
    };
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
