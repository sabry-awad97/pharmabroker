#!/usr/bin/env bun
/**
 * Evaluation Tool
 *
 * Evaluates AI extraction accuracy against expected results.
 */

import pc from 'picocolors';
import ora from 'ora';
import prompts from 'prompts';
import type { AIProviderName } from '@pharmabroker/ai';
import { createTestRunner } from './runner';
import { reporter } from './reporter';
import { allSuites, getSuite } from './test-suites';

// ============================================================================
// Main
// ============================================================================

async function main() {
  console.log(pc.bold(pc.magenta('\n📊 AI Evaluation Tool\n')));

  // Select provider
  const { provider } = await prompts({
    type: 'select',
    name: 'provider',
    message: 'Select provider to evaluate:',
    choices: [
      { title: '🐳 Docker Model Runner', value: 'docker' },
      { title: '🦙 Ollama', value: 'ollama' },
      { title: '💎 Gemini', value: 'gemini' },
      { title: '🤖 OpenAI', value: 'openai' },
    ],
  });

  if (!provider) return;

  // Select what to evaluate
  const { evalType } = await prompts({
    type: 'select',
    name: 'evalType',
    message: 'What to evaluate?',
    choices: [
      { title: '📦 Single Suite', value: 'suite' },
      { title: '🏷️ By Tag', value: 'tag' },
      { title: '🔄 All Suites', value: 'all' },
    ],
  });

  if (!evalType) return;

  let suitesToRun = allSuites;
  let filterTags: string[] | undefined;

  if (evalType === 'suite') {
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
    suitesToRun = [suite];
  } else if (evalType === 'tag') {
    // Collect all available tags
    const allTags = new Set<string>();
    for (const suite of allSuites) {
      for (const c of suite.cases) {
        c.tags?.forEach(t => allTags.add(t));
      }
    }

    const { tag } = await prompts({
      type: 'select',
      name: 'tag',
      message: 'Select tag:',
      choices: Array.from(allTags)
        .sort()
        .map(t => ({ title: t, value: t })),
    });

    if (!tag) return;

    filterTags = [tag];
  }

  // Output format
  const { outputFormat } = await prompts({
    type: 'select',
    name: 'outputFormat',
    message: 'Output format:',
    choices: [
      { title: '📋 Summary only', value: 'summary' },
      { title: '📝 Detailed results', value: 'detailed' },
      { title: '❌ Failed only', value: 'failed' },
    ],
  });

  if (!outputFormat) return;

  console.log();
  const spinner = ora('Running evaluation...').start();

  try {
    const runner = createTestRunner(provider as AIProviderName);
    const results = await runner.runSuites(suitesToRun, {
      tags: filterTags,
      onProgress: (current, total, testCase) => {
        spinner.text = `Evaluating... (${current}/${total}) ${testCase.name}`;
      },
    });

    spinner.stop();

    // Print results based on format
    if (outputFormat === 'detailed' || outputFormat === 'failed') {
      for (const [suiteName, { results: suiteResults }] of results) {
        const filteredResults =
          outputFormat === 'failed'
            ? suiteResults.filter(r => !r.passed)
            : suiteResults;

        if (filteredResults.length === 0) continue;

        console.log(pc.bold(pc.underline(`\n${suiteName}`)));
        console.log();

        for (const result of filteredResults) {
          console.log(reporter.formatEvaluationResult(result));
          console.log();
        }
      }
    }

    // Always print summary
    console.log();
    console.log(reporter.formatSuiteSummary(results));

    // Print overall metrics
    const allResults = Array.from(results.values()).flatMap(r => r.results);
    const overallMetrics = new (
      await import('./evaluator')
    ).Evaluator().aggregateMetrics(allResults);

    console.log();
    console.log(
      reporter.formatAggregatedMetrics(overallMetrics, 'Overall Metrics'),
    );
  } catch (error) {
    spinner.fail('Evaluation failed');
    console.error(
      pc.red(error instanceof Error ? error.message : String(error)),
    );
  }
}

main().catch(console.error);
