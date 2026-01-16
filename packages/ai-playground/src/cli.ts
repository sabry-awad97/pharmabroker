#!/usr/bin/env bun
/**
 * AI Playground CLI
 *
 * Interactive CLI for testing AI providers and extractions.
 *
 * Usage:
 *   bun run src/cli.ts                    # Interactive mode
 *   bun run src/cli.ts chat docker        # Direct chat with docker provider
 *   bun run src/cli.ts test docker        # Run tests with docker provider
 *   bun run src/cli.ts list               # List test suites
 */

import pc from 'picocolors';
import ora from 'ora';
import prompts from 'prompts';
import { z } from 'zod';
import {
  createAIClient,
  type AIProviderName,
  type AIEnvConfig,
} from '@pharmabroker/ai';
import { createTestRunner } from './runner';
import { reporter } from './reporter';
import { allSuites, getSuite } from './test-suites';
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

const defaultProcessOptions = {
  schema: messageAnalysisSchema,
  systemPrompt: `You are an AI assistant specialized in analyzing WhatsApp messages for a pharmaceutical distribution company.
Extract structured information including intent, sentiment, and entities.
For confidence scores: 0.9+ for clear cases, 0.7-0.9 for likely cases, below 0.7 for uncertain.`,
  promptTemplate: `Analyze this WhatsApp message:
{{context}}

Message: "{{message}}"

Extract the intent, sentiment, and any relevant entities.`,
};

// Configure prompts to not exit on cancel
prompts.override({});

// Handle SIGINT gracefully
process.on('SIGINT', () => {
  console.log(pc.yellow('\n\nGoodbye! 👋\n'));
  process.exit(0);
});

// ============================================================================
// CLI Commands
// ============================================================================

async function interactiveChat(provider: AIProviderName) {
  const client = createAIClient({ provider, envConfig });

  console.log(pc.bold(pc.cyan('\n🤖 AI Playground - Interactive Mode')));
  console.log(pc.gray(`Provider: ${provider}, Model: ${client.modelName}`));
  console.log(pc.gray('Type "exit" to quit, "clear" to clear history\n'));

  const history: string[] = [];

  while (true) {
    const { message } = await prompts({
      type: 'text',
      name: 'message',
      message: pc.green('You:'),
    });

    if (!message || message.toLowerCase() === 'exit') {
      console.log(pc.yellow('\nGoodbye! 👋\n'));
      break;
    }

    if (message.toLowerCase() === 'clear') {
      history.length = 0;
      console.log(pc.gray('History cleared.\n'));
      continue;
    }

    const spinner = ora('Thinking...').start();

    try {
      const startTime = Date.now();
      const result = await client.generateText(message, {
        system:
          'You are a helpful assistant for a pharmaceutical distribution company. Respond concisely.',
      });
      const latency = Date.now() - startTime;

      spinner.stop();

      console.log(pc.blue(`AI (${latency}ms):`), result.text);
      console.log();

      history.push(`User: ${message}`);
      history.push(`AI: ${result.text}`);
    } catch (error) {
      spinner.fail('Error');
      console.error(
        pc.red(error instanceof Error ? error.message : String(error)),
      );
      console.log();
    }
  }
}

async function runTestSuite(provider: AIProviderName, suiteName?: string) {
  const runner = createTestRunner(provider);

  console.log(pc.bold(pc.cyan('\n🧪 AI Playground - Test Runner')));
  console.log(pc.gray(`Provider: ${provider}, Model: ${runner.modelName}\n`));

  let suitesToRun = allSuites;

  if (suiteName) {
    const suite = getSuite(suiteName);
    if (!suite) {
      console.error(pc.red(`Suite "${suiteName}" not found.`));
      console.log(pc.gray('Available suites:'));
      for (const s of allSuites) {
        console.log(pc.gray(`  - ${s.name}`));
      }
      return;
    }
    suitesToRun = [suite];
  }

  const spinner = ora('Running tests...').start();

  try {
    const results = await runner.runSuites(suitesToRun, {
      onProgress: (current, total, testCase) => {
        spinner.text = `Running tests... (${current}/${total}) ${testCase.name}`;
      },
    });

    spinner.stop();

    // Print detailed results
    for (const [suiteName, { results: suiteResults }] of results) {
      console.log(pc.bold(pc.underline(`\n${suiteName}`)));
      console.log();

      for (const result of suiteResults) {
        console.log(reporter.formatEvaluationResult(result));
        console.log();
      }
    }

    // Print summary
    console.log(reporter.formatSuiteSummary(results));
  } catch (error) {
    spinner.fail('Error running tests');
    console.error(
      pc.red(error instanceof Error ? error.message : String(error)),
    );
  }
}

async function processMessage(provider: AIProviderName, text: string) {
  const client = createAIClient({ provider, envConfig });

  console.log(pc.bold(pc.cyan('\n📝 AI Playground - Process Message')));
  console.log(pc.gray(`Provider: ${provider}, Model: ${client.modelName}\n`));

  const spinner = ora('Processing...').start();

  try {
    const result = await client.processMessage(
      {
        id: 'playground-' + Date.now(),
        text,
        timestamp: new Date(),
      },
      defaultProcessOptions,
    );

    spinner.stop();

    console.log(pc.bold('Status:'), result.status);
    console.log(pc.bold('Latency:'), `${result.processingTimeMs}ms`);

    // Show structured data if available
    if (result.data) {
      console.log(pc.bold('\nExtracted Data:'));
      console.log(pc.cyan(JSON.stringify(result.data, null, 2)));
    } else if (result.extractions.length > 0) {
      console.log(pc.bold('Extractions:'), result.extractions.length);
      console.log();
      for (const extraction of result.extractions) {
        console.log(
          pc.cyan(`  [${extraction.type}]`),
          JSON.stringify(extraction.data, null, 2),
        );
        console.log(
          pc.gray(`  Confidence: ${(extraction.confidence * 100).toFixed(1)}%`),
        );
        console.log();
      }
    }

    if (result.error) {
      console.log(pc.red('Error:'), result.error);
    }
  } catch (error) {
    spinner.fail('Error processing message');
    console.error(
      pc.red(error instanceof Error ? error.message : String(error)),
    );
  }
}

async function listSuites() {
  console.log(pc.bold(pc.cyan('\n📋 Available Test Suites\n')));

  for (const suite of allSuites) {
    console.log(pc.bold(suite.name));
    if (suite.description) {
      console.log(pc.gray(`  ${suite.description}`));
    }
    console.log(pc.gray(`  ${suite.cases.length} test cases`));

    // Collect all tags
    const tags = new Set<string>();
    for (const c of suite.cases) {
      c.tags?.forEach(t => tags.add(t));
    }
    if (tags.size > 0) {
      console.log(pc.gray(`  Tags: ${Array.from(tags).join(', ')}`));
    }
    console.log();
  }
}

// ============================================================================
// Main Menu
// ============================================================================

function isValidProvider(p: string): p is AIProviderName {
  return ['docker', 'ollama', 'gemini', 'openai'].includes(p);
}

function printUsage() {
  console.log(pc.bold(pc.magenta('\n🎮 AI Playground\n')));
  console.log('Usage:');
  console.log('  bun run src/cli.ts                     Interactive mode');
  console.log(
    '  bun run src/cli.ts chat <provider>     Start chat with provider',
  );
  console.log(
    '  bun run src/cli.ts test <provider>     Run tests with provider',
  );
  console.log('  bun run src/cli.ts list                List test suites');
  console.log();
  console.log('Providers: docker, ollama, gemini, openai');
  console.log();
}

async function main() {
  const args = process.argv.slice(2);

  // Handle CLI arguments for non-interactive mode
  if (args.length > 0) {
    const command = args[0];
    const provider = args[1];

    switch (command) {
      case 'list':
        await listSuites();
        return;

      case 'chat':
        if (!provider || !isValidProvider(provider)) {
          console.error(
            pc.red(
              'Please specify a valid provider: docker, ollama, gemini, openai',
            ),
          );
          return;
        }
        await interactiveChat(provider);
        return;

      case 'test':
        if (!provider || !isValidProvider(provider)) {
          console.error(
            pc.red(
              'Please specify a valid provider: docker, ollama, gemini, openai',
            ),
          );
          return;
        }
        await runTestSuite(provider, args[2]);
        return;

      case 'help':
      case '--help':
      case '-h':
        printUsage();
        return;

      default:
        console.error(pc.red(`Unknown command: ${command}`));
        printUsage();
        return;
    }
  }

  // Check if running in interactive mode
  if (!process.stdin.isTTY) {
    console.log(pc.yellow('Non-interactive mode detected. Use CLI arguments:'));
    printUsage();
    return;
  }

  console.log(pc.bold(pc.magenta('\n🎮 AI Playground\n')));

  const { action } = await prompts({
    type: 'select',
    name: 'action',
    message: 'What would you like to do?',
    choices: [
      { title: '� Interactive Chat', value: 'chat' },
      { title: '📝 Process a Message', value: 'process' },
      { title: '🧪 Run Test Suite', value: 'test' },
      { title: '📋 List Test Suites', value: 'list' },
      { title: '🚪 Exit', value: 'exit' },
    ],
  });

  if (action === 'exit' || !action) {
    console.log(pc.yellow('\nGoodbye! 👋\n'));
    return;
  }

  if (action === 'list') {
    await listSuites();
    return main();
  }

  // Select provider
  const { provider } = await prompts({
    type: 'select',
    name: 'provider',
    message: 'Select AI provider:',
    choices: [
      { title: '🐳 Docker Model Runner (local)', value: 'docker' },
      { title: '🦙 Ollama (local)', value: 'ollama' },
      { title: '💎 Gemini (Google)', value: 'gemini' },
      { title: '🤖 OpenAI', value: 'openai' },
    ],
  });

  if (!provider) {
    return main();
  }

  switch (action) {
    case 'chat':
      await interactiveChat(provider);
      break;

    case 'process': {
      const { text } = await prompts({
        type: 'text',
        name: 'text',
        message: 'Enter message to process:',
      });
      if (text) {
        await processMessage(provider, text);
      }
      break;
    }

    case 'test': {
      const { suite } = await prompts({
        type: 'select',
        name: 'suite',
        message: 'Select test suite:',
        choices: [
          { title: '🔄 All Suites', value: '' },
          ...allSuites.map(s => ({ title: s.name, value: s.name })),
        ],
      });
      await runTestSuite(provider, suite || undefined);
      break;
    }
  }

  // Return to main menu
  console.log();
  return main();
}

// ============================================================================
// Entry Point
// ============================================================================

main().catch(console.error);
