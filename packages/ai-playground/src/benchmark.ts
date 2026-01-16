#!/usr/bin/env bun
/**
 * Benchmark Tool
 *
 * Runs performance benchmarks on AI providers.
 */

import pc from 'picocolors';
import ora from 'ora';
import prompts from 'prompts';
import type { AIProviderName } from '@pharmabroker/ai';
import { createBenchmarkRunner } from './runner';
import { reporter } from './reporter';
import { allSuites, getSuite } from './test-suites';
import type { BenchmarkConfig } from './types';

// ============================================================================
// Main
// ============================================================================

async function main() {
  console.log(pc.bold(pc.magenta('\n⚡ AI Benchmark Tool\n')));

  // Select provider
  const { provider } = await prompts({
    type: 'select',
    name: 'provider',
    message: 'Select provider to benchmark:',
    choices: [
      { title: '🐳 Docker Model Runner', value: 'docker' },
      { title: '🦙 Ollama', value: 'ollama' },
      { title: '💎 Gemini', value: 'gemini' },
      { title: '🤖 OpenAI', value: 'openai' },
    ],
  });

  if (!provider) return;

  // Select test suite
  const { suiteName } = await prompts({
    type: 'select',
    name: 'suiteName',
    message: 'Select test suite:',
    choices: allSuites.map(s => ({
      title: `${s.name} (${s.cases.length} cases)`,
      value: s.name,
    })),
  });

  if (!suiteName) return;

  const suite = getSuite(suiteName);
  if (!suite) {
    console.error(pc.red(`Suite "${suiteName}" not found.`));
    return;
  }

  // Configure benchmark
  const config = await prompts([
    {
      type: 'number',
      name: 'iterations',
      message: 'Iterations per test case:',
      initial: 5,
      min: 1,
      max: 100,
    },
    {
      type: 'number',
      name: 'warmupIterations',
      message: 'Warmup iterations:',
      initial: 1,
      min: 0,
      max: 10,
    },
    {
      type: 'number',
      name: 'concurrency',
      message: 'Concurrency:',
      initial: 1,
      min: 1,
      max: 10,
    },
  ]);

  if (!config.iterations) return;

  const benchmarkConfig: BenchmarkConfig = {
    provider: provider as AIProviderName,
    iterations: config.iterations,
    warmupIterations: config.warmupIterations ?? 1,
    concurrency: config.concurrency ?? 1,
  };

  console.log();
  console.log(pc.cyan('Starting benchmark...'));
  console.log(pc.gray(`Suite: ${suite.name}`));
  console.log(pc.gray(`Provider: ${provider}`));
  console.log(pc.gray(`Iterations: ${benchmarkConfig.iterations}`));
  console.log(pc.gray(`Warmup: ${benchmarkConfig.warmupIterations}`));
  console.log();

  const spinner = ora('Running benchmark...').start();

  try {
    const runner = createBenchmarkRunner();
    const result = await runner.run(suite, benchmarkConfig);

    spinner.stop();

    console.log(reporter.formatBenchmarkResult(result));
  } catch (error) {
    spinner.fail('Benchmark failed');
    console.error(
      pc.red(error instanceof Error ? error.message : String(error)),
    );
  }
}

main().catch(console.error);
