/**
 * Report Generator
 *
 * Generates formatted reports for evaluation and benchmark results.
 */

import pc from 'picocolors';
import Table from 'cli-table3';
import type {
  EvaluationResult,
  AggregatedMetrics,
  BenchmarkResult,
  ProviderComparisonResult,
} from './types';

// ============================================================================
// Report Formatters
// ============================================================================

export class Reporter {
  /**
   * Format a single evaluation result
   */
  formatEvaluationResult(result: EvaluationResult): string {
    const status = result.passed ? pc.green('✓ PASS') : pc.red('✗ FAIL');

    const lines = [
      `${status} ${pc.bold(result.testCase.name)} (${result.testCase.id})`,
      `  Latency: ${result.metrics.latencyMs.toFixed(0)}ms`,
      `  Extractions: ${result.processingResult.extractions.length}`,
    ];

    // Show extraction data in formatted JSON
    if (result.processingResult.extractions.length > 0) {
      lines.push(pc.cyan('  Extracted Data:'));
      for (const extraction of result.processingResult.extractions) {
        lines.push(
          pc.dim(
            `    ┌─ ${pc.bold(extraction.type)} (confidence: ${(extraction.confidence * 100).toFixed(0)}%)`,
          ),
        );
        const dataStr = JSON.stringify(extraction.data, null, 2);
        const dataLines = dataStr.split('\n');
        for (let i = 0; i < dataLines.length; i++) {
          const prefix = i === dataLines.length - 1 ? '    └─ ' : '    │  ';
          lines.push(pc.dim(prefix) + pc.white(dataLines[i]));
        }
      }
    }

    if (result.testCase.expected && result.testCase.expected.length > 0) {
      lines.push(
        `  Expected: ${result.metrics.expectedCount}, Matched: ${result.metrics.matchedCount}`,
      );
      lines.push(
        `  Precision: ${(result.metrics.precision * 100).toFixed(1)}%, Recall: ${(result.metrics.recall * 100).toFixed(1)}%`,
      );
    }

    if (!result.passed && result.comparisons.length > 0) {
      lines.push(pc.yellow('  Mismatches:'));
      for (const comp of result.comparisons.filter(c => !c.matched)) {
        lines.push(`    - Type: ${comp.expected.type}`);
        for (const mismatch of comp.mismatches) {
          lines.push(
            `      ${mismatch.field}: expected ${JSON.stringify(mismatch.expected)}, got ${JSON.stringify(mismatch.actual)}`,
          );
        }
      }
    }

    return lines.join('\n');
  }

  /**
   * Format aggregated metrics
   */
  formatAggregatedMetrics(metrics: AggregatedMetrics, title?: string): string {
    const table = new Table({
      head: [pc.cyan('Metric'), pc.cyan('Value')],
      colWidths: [25, 20],
    });

    table.push(
      ['Total Cases', metrics.totalCases.toString()],
      [
        'Passed Cases',
        `${metrics.passedCases} (${(metrics.passRate * 100).toFixed(1)}%)`,
      ],
      ['Avg Latency', `${metrics.avgLatencyMs.toFixed(0)}ms`],
      ['P50 Latency', `${metrics.p50LatencyMs.toFixed(0)}ms`],
      ['P95 Latency', `${metrics.p95LatencyMs.toFixed(0)}ms`],
      ['P99 Latency', `${metrics.p99LatencyMs.toFixed(0)}ms`],
      ['Avg Precision', `${(metrics.avgPrecision * 100).toFixed(1)}%`],
      ['Avg Recall', `${(metrics.avgRecall * 100).toFixed(1)}%`],
      ['Avg F1 Score', `${(metrics.avgF1Score * 100).toFixed(1)}%`],
    );

    const header = title ? pc.bold(pc.underline(title)) + '\n\n' : '';
    return header + table.toString();
  }

  /**
   * Format benchmark results
   */
  formatBenchmarkResult(result: BenchmarkResult): string {
    const lines = [
      pc.bold(pc.underline('Benchmark Results')),
      '',
      pc.cyan('Configuration:'),
      `  Provider: ${result.config.provider}`,
      `  Iterations: ${result.config.iterations}`,
      `  Warmup: ${result.config.warmupIterations}`,
      `  Concurrency: ${result.config.concurrency}`,
      `  Total Duration: ${(result.totalDurationMs / 1000).toFixed(2)}s`,
      '',
    ];

    // Per-case results table
    const caseTable = new Table({
      head: [
        pc.cyan('Test Case'),
        pc.cyan('Avg (ms)'),
        pc.cyan('Min (ms)'),
        pc.cyan('Max (ms)'),
        pc.cyan('Success'),
      ],
      colWidths: [30, 12, 12, 12, 12],
    });

    for (const caseResult of result.caseResults) {
      const latencies = caseResult.latencies;
      const avg =
        latencies.length > 0
          ? latencies.reduce((a, b) => a + b, 0) / latencies.length
          : 0;
      const min = latencies.length > 0 ? Math.min(...latencies) : 0;
      const max = latencies.length > 0 ? Math.max(...latencies) : 0;

      caseTable.push([
        caseResult.testCase.name.substring(0, 28),
        avg.toFixed(0),
        min.toFixed(0),
        max.toFixed(0),
        `${(caseResult.successRate * 100).toFixed(0)}%`,
      ]);
    }

    lines.push(caseTable.toString());
    lines.push('');
    lines.push(
      this.formatAggregatedMetrics(result.aggregated, 'Aggregated Metrics'),
    );

    return lines.join('\n');
  }

  /**
   * Format provider comparison results
   */
  formatProviderComparison(result: ProviderComparisonResult): string {
    const lines = [
      pc.bold(pc.underline(`Provider Comparison: ${result.testSuite.name}`)),
      '',
    ];

    // Comparison table
    const table = new Table({
      head: [
        pc.cyan('Provider'),
        pc.cyan('Pass Rate'),
        pc.cyan('Avg Latency'),
        pc.cyan('P95 Latency'),
        pc.cyan('Precision'),
        pc.cyan('Recall'),
        pc.cyan('F1'),
      ],
    });

    for (const [provider, metrics] of result.providerResults) {
      const isWinner = (metric: keyof typeof result.winners) =>
        result.winners[metric] === provider ? pc.green('★') : '';

      table.push([
        provider,
        `${(metrics.passRate * 100).toFixed(0)}% ${isWinner('passRate')}`,
        `${metrics.avgLatencyMs.toFixed(0)}ms ${isWinner('latency')}`,
        `${metrics.p95LatencyMs.toFixed(0)}ms`,
        `${(metrics.avgPrecision * 100).toFixed(0)}% ${isWinner('precision')}`,
        `${(metrics.avgRecall * 100).toFixed(0)}% ${isWinner('recall')}`,
        `${(metrics.avgF1Score * 100).toFixed(0)}% ${isWinner('f1Score')}`,
      ]);
    }

    lines.push(table.toString());
    lines.push('');
    lines.push(pc.green('★') + ' = Best in category');

    return lines.join('\n');
  }

  /**
   * Format a summary of multiple suite results
   */
  formatSuiteSummary(
    results: Map<
      string,
      { results: EvaluationResult[]; aggregated: AggregatedMetrics }
    >,
  ): string {
    const lines = [pc.bold(pc.underline('Test Suite Summary')), ''];

    const table = new Table({
      head: [
        pc.cyan('Suite'),
        pc.cyan('Cases'),
        pc.cyan('Passed'),
        pc.cyan('Pass Rate'),
        pc.cyan('Avg Latency'),
      ],
    });

    let totalCases = 0;
    let totalPassed = 0;

    for (const [suiteName, { aggregated }] of results) {
      table.push([
        suiteName,
        aggregated.totalCases.toString(),
        aggregated.passedCases.toString(),
        `${(aggregated.passRate * 100).toFixed(0)}%`,
        `${aggregated.avgLatencyMs.toFixed(0)}ms`,
      ]);

      totalCases += aggregated.totalCases;
      totalPassed += aggregated.passedCases;
    }

    // Total row
    table.push([
      pc.bold('TOTAL'),
      pc.bold(totalCases.toString()),
      pc.bold(totalPassed.toString()),
      pc.bold(`${((totalPassed / totalCases) * 100).toFixed(0)}%`),
      '-',
    ]);

    lines.push(table.toString());

    return lines.join('\n');
  }
}

// ============================================================================
// Singleton Export
// ============================================================================

export const reporter = new Reporter();
