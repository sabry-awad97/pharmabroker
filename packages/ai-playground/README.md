# @pharmabroker/ai-playground

AI testing, evaluation, and benchmarking tools for the PharmaBroker AI service.

## Features

- 🎮 **Interactive CLI** - Chat with AI models and test extractions
- 🧪 **Test Suites** - Pre-defined test cases for various extraction types
- 📊 **Evaluation** - Measure accuracy with precision, recall, and F1 scores
- ⚡ **Benchmarking** - Performance testing with latency percentiles
- 🔄 **Provider Comparison** - Compare multiple AI providers side-by-side

## Quick Start

```bash
# Interactive playground
bun run --filter @pharmabroker/ai-playground play

# Run benchmarks
bun run --filter @pharmabroker/ai-playground bench

# Evaluate accuracy
bun run --filter @pharmabroker/ai-playground eval

# Compare providers
bun run --filter @pharmabroker/ai-playground compare
```

## Test Suites

| Suite                    | Description              | Cases |
| ------------------------ | ------------------------ | ----- |
| Basic Text Understanding | Basic text comprehension | 3     |
| Order Extraction         | Extract order details    | 4     |
| Intent Classification    | Classify user intents    | 4     |
| Sentiment Analysis       | Detect sentiment         | 3     |
| Entity Extraction        | Extract named entities   | 3     |
| Complex Scenarios        | Multi-intent messages    | 3     |

## Evaluation Metrics

### Per-Case Metrics

- **Latency** - Processing time in milliseconds
- **Precision** - Matched extractions / Actual extractions
- **Recall** - Matched extractions / Expected extractions
- **F1 Score** - Harmonic mean of precision and recall

### Aggregated Metrics

- **Pass Rate** - Percentage of test cases that passed
- **Avg/P50/P95/P99 Latency** - Latency distribution
- **Avg Precision/Recall/F1** - Average accuracy metrics

## Creating Custom Test Cases

```typescript
import type { TestCase } from '@pharmabroker/ai-playground';

const myTestCase: TestCase = {
  id: 'custom-order-1',
  name: 'Custom Order Test',
  input: {
    text: 'Necesito 10 cajas de aspirina',
    senderName: 'Cliente',
    groupName: 'Pedidos',
  },
  expected: [
    {
      type: 'order',
      data: {
        items: [{ name: 'aspirina', quantity: 10 }],
      },
      minConfidence: 0.8,
    },
  ],
  tags: ['order', 'custom'],
};
```

## Programmatic Usage

```typescript
import {
  createTestRunner,
  createBenchmarkRunner,
  evaluator,
  reporter,
  orderExtractionSuite,
} from '@pharmabroker/ai-playground';

// Run tests
const runner = createTestRunner('docker');
const { results, aggregated } = await runner.runSuite(orderExtractionSuite);

// Print results
console.log(reporter.formatAggregatedMetrics(aggregated));

// Run benchmark
const benchRunner = createBenchmarkRunner();
const benchResult = await benchRunner.run(orderExtractionSuite, {
  provider: 'docker',
  iterations: 10,
  warmupIterations: 2,
  concurrency: 1,
});

console.log(reporter.formatBenchmarkResult(benchResult));
```

## Environment Variables

The playground uses the same environment variables as `@pharmabroker/ai`:

```bash
# Default provider
AI_PROVIDER=docker

# Docker Model Runner
DOCKER_MODEL_BASE_URL=http://model-runner.docker.internal/engines/v1
DOCKER_MODEL_NAME=ai/qwen3-vl

# Ollama
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=llama3.2

# Gemini
GEMINI_API_KEY=your-api-key
GEMINI_MODEL=gemini-2.0-flash

# OpenAI
OPENAI_API_KEY=your-api-key
OPENAI_MODEL=gpt-4o-mini
```
