#!/usr/bin/env bun
/**
 * AI Playground CLI
 *
 * Interactive CLI for testing pharmaceutical message extraction.
 *
 * Usage:
 *   bun run src/cli.ts                    # Interactive mode
 *   bun run src/cli.ts extract docker     # Extract from test messages
 *   bun run src/cli.ts chat docker        # Direct chat with provider
 */

import pc from 'picocolors';
import ora from 'ora';
import prompts from 'prompts';
import boxen from 'boxen';
import {
  createAIClient,
  type AIProviderName,
  type AIEnvConfig,
  type ProcessingDebugInfo,
  medicationSystemPrompt,
  medicationPromptTemplate,
} from '@pharmabroker/ai';
import {
  messageExtractionSchema,
  type MessageExtraction,
} from '@pharmabroker/schemas/ai';
import { env } from './env';
import testMessages from './test-messages.json';

// ============================================================================
// Totals Tracking
// ============================================================================

interface ExtractionTotals {
  messagesProcessed: number;
  messagesSucceeded: number;
  messagesFailed: number;
  totalMedications: number;
  totalLatencyMs: number;
  totalInputTokens: number;
  totalChunks: number;
}

// Create env config
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

// Handle Ctrl+C gracefully
process.on('SIGINT', () => {
  console.log(pc.yellow('\n\nGoodbye! 👋\n'));
  process.exit(0);
});

// ============================================================================
// Display Helpers
// ============================================================================

function displayDebugInfo(debug: ProcessingDebugInfo) {
  const lines = [
    `${pc.bold('Message:')} ${debug.messageChars} chars, ${debug.messageLines} lines, ${debug.messageTokens} tokens`,
    `${pc.bold('Prompt:')} ${debug.promptTokens} tokens`,
    `${pc.bold('Total Input:')} ${debug.totalInputTokens} tokens`,
    `${pc.bold('Output:')} ${debug.outputTokens ?? 0} tokens`,
  ];

  if (debug.chunksUsed > 1) {
    lines.push(
      `${pc.bold('Chunks:')} ${debug.chunksUsed} (~${debug.tokensPerChunk} tokens/chunk)`,
    );
  }

  console.log(
    boxen(lines.join('\n'), {
      title: '🔍 Debug Info',
      titleAlignment: 'left',
      padding: { top: 0, bottom: 0, left: 1, right: 1 },
      margin: 0,
      borderStyle: 'round',
      borderColor: 'gray',
      dimBorder: true,
    }),
  );
}

function displayTotals(totals: ExtractionTotals, provider: string) {
  const successRate =
    totals.messagesProcessed > 0
      ? ((totals.messagesSucceeded / totals.messagesProcessed) * 100).toFixed(1)
      : '0';
  const avgLatency =
    totals.messagesProcessed > 0
      ? Math.round(totals.totalLatencyMs / totals.messagesProcessed)
      : 0;

  const content = [
    `${pc.bold('Provider:')} ${provider}`,
    '',
    `${pc.bold('Messages:')} ${totals.messagesSucceeded}/${totals.messagesProcessed} (${successRate}% success)`,
    `${pc.bold('Medications Found:')} ${totals.totalMedications}`,
    `${pc.bold('Total Chunks:')} ${totals.totalChunks}`,
    '',
    `${pc.bold('Total Latency:')} ${totals.totalLatencyMs}ms`,
    `${pc.bold('Avg Latency:')} ${avgLatency}ms/message`,
    `${pc.bold('Total Input Tokens:')} ${totals.totalInputTokens}`,
  ].join('\n');

  console.log(
    boxen(content, {
      title: '📊 Extraction Summary',
      titleAlignment: 'center',
      padding: 1,
      margin: 1,
      borderStyle: 'round',
      borderColor: 'cyan',
    }),
  );
}

function displayExtraction(
  data: MessageExtraction,
  latency: number,
  debug?: ProcessingDebugInfo,
) {
  const intentColor = data.intent === 'offer' ? pc.green : pc.yellow;
  const urgencyColors: Record<string, (s: string) => string> = {
    critical: pc.red,
    urgent: pc.yellow,
    soon: pc.cyan,
    normal: pc.gray,
  };
  const urgencyEmoji: Record<string, string> = {
    critical: '🚨',
    urgent: '⚡',
    soon: '⏰',
    normal: '📋',
  };
  const urgencyColor = urgencyColors[data.urgency] || pc.gray;

  console.log(pc.bold('Intent:'), intentColor(data.intent.toUpperCase()));
  console.log(
    pc.bold('Urgency:'),
    urgencyColor(
      `${urgencyEmoji[data.urgency] || ''} ${data.urgency.toUpperCase()}`,
    ),
  );
  console.log(pc.bold('Reason:'), data.reason);
  console.log(pc.bold('Medications:'));

  if (data.medications.length > 0) {
    for (const med of data.medications) {
      const confColor =
        med.confidence >= 0.8
          ? pc.green
          : med.confidence >= 0.5
            ? pc.yellow
            : pc.red;
      const confBar =
        '█'.repeat(Math.round(med.confidence * 10)) +
        '░'.repeat(10 - Math.round(med.confidence * 10));
      const concStr = med.concentration
        ? pc.cyan(`[${med.concentration}]`)
        : pc.gray('[--]');
      const formStr = med.form ? pc.magenta(`(${med.form})`) : '';
      const expStr = med.expiry ? pc.yellow(`exp:${med.expiry}`) : '';
      console.log(
        `  ${confColor(confBar)} ${(med.confidence * 100).toFixed(0).padStart(3)}% ${med.name} ${concStr} ${formStr} ${expStr}`.trim(),
      );
      console.log(`       ${pc.gray(med.reason)}`);
    }
  } else {
    console.log(pc.gray('  (none)'));
  }

  console.log(pc.gray(`Latency: ${latency}ms`));
  if (debug) {
    displayDebugInfo(debug);
  }
}

// ============================================================================
// CLI Commands
// ============================================================================

async function extractFromTestMessages(provider: AIProviderName) {
  console.log(pc.bold(pc.magenta('\n🔍 Medication Extraction Test\n')));
  console.log(pc.gray(`Provider: ${provider}\n`));

  const client = createAIClient({ provider, envConfig });

  const totals: ExtractionTotals = {
    messagesProcessed: 0,
    messagesSucceeded: 0,
    messagesFailed: 0,
    totalMedications: 0,
    totalLatencyMs: 0,
    totalInputTokens: 0,
    totalChunks: 0,
  };

  for (const msg of testMessages.messages) {
    console.log(pc.bold(pc.cyan(`\n📝 ${msg.name}`)));
    console.log(pc.gray(`ID: ${msg.id}`));
    console.log(pc.gray(`Text: ${msg.input.text.substring(0, 80)}...`));
    console.log();

    const startTime = Date.now();
    totals.messagesProcessed++;

    try {
      const result = await client.processMessage(
        {
          id: msg.id,
          text: msg.input.text,
          senderName: msg.input.senderName,
          groupName: msg.input.groupName,
          timestamp: new Date(),
        },
        {
          schema: messageExtractionSchema,
          systemPrompt: medicationSystemPrompt,
          promptTemplate: medicationPromptTemplate,
        },
      );

      const latency = Date.now() - startTime;
      totals.totalLatencyMs += latency;

      if (result.debug) {
        totals.totalInputTokens += result.debug.totalInputTokens;
        totals.totalChunks += result.debug.chunksUsed;
      }

      if (result.data) {
        totals.messagesSucceeded++;
        totals.totalMedications += result.data.medications.length;
        displayExtraction(result.data, latency, result.debug);
      } else {
        totals.messagesFailed++;
        console.log(pc.red('Failed to extract'));
        if (result.error) {
          console.log(pc.red('Error:'), result.error);
        }
        if (result.debug) {
          displayDebugInfo(result.debug);
        }
        console.log(pc.gray('Status:'), result.status);
        console.log(pc.gray(`Latency: ${latency}ms`));
      }
    } catch (error) {
      totals.messagesFailed++;
      console.log(
        pc.red('Error:'),
        error instanceof Error ? error.message : String(error),
      );
    }

    console.log(pc.dim('─'.repeat(60)));
  }

  // Display totals summary
  displayTotals(totals, provider);
}

async function extractSingleMessage(provider: AIProviderName, text: string) {
  const client = createAIClient({ provider, envConfig });

  console.log(pc.bold(pc.cyan('\n📝 Extracting from custom message\n')));

  const spinner = ora('Processing...').start();
  const startTime = Date.now();

  try {
    const result = await client.processMessage(
      {
        id: 'manual-' + Date.now(),
        text,
        timestamp: new Date(),
      },
      {
        schema: messageExtractionSchema,
        systemPrompt: medicationSystemPrompt,
        promptTemplate: medicationPromptTemplate,
      },
    );

    spinner.stop();
    const latency = Date.now() - startTime;

    if (result.data) {
      displayExtraction(result.data, latency, result.debug);
    } else {
      console.log(pc.red('Failed to extract'));
      if (result.error) {
        console.log(pc.red('Error:'), result.error);
      }
      if (result.debug) {
        displayDebugInfo(result.debug);
      }
    }
  } catch (error) {
    spinner.fail('Error');
    console.error(
      pc.red(error instanceof Error ? error.message : String(error)),
    );
  }
}

async function interactiveChat(provider: AIProviderName) {
  const client = createAIClient({ provider, envConfig });

  console.log(pc.bold(pc.cyan('\n🤖 AI Chat Mode')));
  console.log(pc.gray(`Model: ${client.modelName}`));
  console.log(pc.gray('Type "exit" to quit\n'));

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

    const spinner = ora('Thinking...').start();

    try {
      const startTime = Date.now();
      const result = await client.generateText(message, {
        system:
          'You are a helpful assistant for a pharmaceutical distribution company.',
      });
      const latency = Date.now() - startTime;

      spinner.stop();
      console.log(pc.blue(`AI (${latency}ms):`), result.text);
      console.log();
    } catch (error) {
      spinner.fail('Error');
      console.error(
        pc.red(error instanceof Error ? error.message : String(error)),
      );
    }
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
  console.log('  bun run src/cli.ts                      Interactive mode');
  console.log(
    '  bun run src/cli.ts extract <provider>   Extract from test messages',
  );
  console.log('  bun run src/cli.ts chat <provider>      Interactive chat');
  console.log();
  console.log('Providers: docker, ollama, gemini, openai');
  console.log();
}

async function main() {
  const args = process.argv.slice(2);

  // Handle CLI arguments
  if (args.length > 0) {
    const command = args[0];
    const provider = args[1];

    switch (command) {
      case 'extract':
        if (!provider || !isValidProvider(provider)) {
          console.error(
            pc.red(
              'Please specify a valid provider: docker, ollama, gemini, openai',
            ),
          );
          return;
        }
        await extractFromTestMessages(provider);
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

  // Interactive mode
  if (!process.stdin.isTTY) {
    console.log(pc.yellow('Non-interactive mode. Use CLI arguments:'));
    printUsage();
    return;
  }

  console.log(pc.bold(pc.magenta('\n🎮 AI Playground\n')));

  const { action } = await prompts({
    type: 'select',
    name: 'action',
    message: 'What would you like to do?',
    choices: [
      { title: '🔍 Extract from Test Messages', value: 'extract' },
      { title: '📝 Extract from Custom Message', value: 'custom' },
      { title: '💬 Interactive Chat', value: 'chat' },
      { title: '🚪 Exit', value: 'exit' },
    ],
  });

  if (action === 'exit' || !action) {
    console.log(pc.yellow('\nGoodbye! 👋\n'));
    return;
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
    case 'extract':
      await extractFromTestMessages(provider);
      break;

    case 'custom': {
      const { text } = await prompts({
        type: 'text',
        name: 'text',
        message: 'Enter message to extract:',
      });
      if (text) {
        await extractSingleMessage(provider, text);
      }
      break;
    }

    case 'chat':
      await interactiveChat(provider);
      break;
  }

  console.log();
  return main();
}

main().catch(console.error);
