#!/usr/bin/env bun
/**
 * Provider Comparison Tool
 *
 * Compares multiple AI providers on the same test suite.
 */

import pc from 'picocolors';
import ora from 'ora';
import prompts from 'prompts';
import type { AIProviderName } from '@pharmabroker/ai';
import { createTestRunner } from './runner';
import { reporter } from './reporter';
import { allSuites, getSuite } from './test-suites';
import type {
  AggregatedMetrics,
  ProviderComparisonResult,
  TestSuite,
} from './types';

// ============================================================================
// Provider Comparison
// ============================================================================

async function compareProviders(
  suite: TestSuite,
  providers: AIProviderName[],
): Promise<ProviderComparisonResult> {
  const providerResults = new Map<AIProviderName, AggregatedMetrics>();

  for (const provider of providers) {
    const spinner = ora(`Testing ${provider}...`).start();

    try {
      const runner = createTestRunner(provider);
      const { aggregated } = await runner.runSuite(suite, {
        onProgress: (current, total, testCase) => {
          spinner.text = `Testing ${provider}... (${current}/${total}) ${testCase.name}`;
        },
      });

      providerResults.set(provider, aggregated);
      spinner.succeed(`${provider} completed`);
    } catch (error) {
      spinner.fail(
        `${provider} failed: ${error instanceof Error ? error.message : String(error)}`,
      );

      // Add empty metrics for failed provider
      providerResults.set(provider, {
        totalCases: suite.cases.length,
        passedCases: 0,
        passRate: 0,
        avgLatencyMs: Infinity,
        p50LatencyMs: Infinity,
        p95LatencyMs: Infinity,
        p99LatencyMs: Infinity,
        avgPrecision: 0,
        avgRecall: 0,
        avgF1Score: 0,
      });
    }
  }

  // Determine winners
  const findWinner = (
    metric: keyof AggregatedMetrics,
    minimize: boolean = false,
  ): AIProviderName => {
    let winner: AIProviderName = providers[0]!;
    let bestValue = minimize ? Infinity : -Infinity;

    for (const [provider, metrics] of providerResults) {
      const value = metrics[metric] as number;
      if (minimize ? value < bestValue : value > bestValue) {
        bestValue = value;
        winner = provider;
      }
    }

    return winner;
  };

  return {
    testSuite: suite,
    providerResults,
    winners: {
      latency: findWinner('avgLatencyMs', true),
      precision: findWinner('avgPrecision'),
      recall: findWinner('avgRecall'),
      f1Score: findWinner('avgF1Score'),
      passRate: findWinner('passRate'),
    },
  };
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  console.log(pc.bold(pc.magenta('\n🔄 AI Provider Comparison Tool\n')));

  // Select providers
  const { providers } = await prompts({
    type: 'multiselect',
    name: 'providers',
    message: 'Select providers to compare:',
    choices: [
      { title: '🐳 Docker Model Runner', value: 'docker' },
      { title: '🦙 Ollama', value: 'ollama' },
      { title: '💎 Gemini', value: 'gemini' },
      { title: '🤖 OpenAI', value: 'openai' },
    ],
    min: 2,
    hint: '- Space to select, Enter to confirm',
  });

  if (!providers || providers.length < 2) {
    console.log(pc.yellow('Please select at least 2 providers to compare.'));
    return;
  }

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

  if (!suiteName) {
    return;
  }

  const suite = getSuite(suiteName);
  if (!suite) {
    console.error(pc.red(`Suite "${suiteName}" not found.`));
    return;
  }

  console.log();
  console.log(
    pc.cyan(`Comparing ${providers.length} providers on "${suite.name}"...`),
  );
  console.log();

  const result = await compareProviders(suite, providers as AIProviderName[]);

  console.log();
  console.log(reporter.formatProviderComparison(result));
  console.log();

  // Detailed breakdown
  const { showDetails } = await prompts({
    type: 'confirm',
    name: 'showDetails',
    message: 'Show detailed metrics for each provider?',
    initial: false,
  });

  if (showDetails) {
    for (const [provider, metrics] of result.providerResults) {
      console.log();
      console.log(
        reporter.formatAggregatedMetrics(metrics, `${provider} Details`),
      );
    }
  }
}

main().catch(console.error);
