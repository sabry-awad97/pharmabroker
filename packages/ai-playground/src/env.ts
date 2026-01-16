/**
 * AI Playground Environment
 *
 * Minimal environment configuration for the playground.
 * Only requires AI-related environment variables.
 */

import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  // AI Provider configuration
  AI_PROVIDER: z
    .enum(['gemini', 'ollama', 'openai', 'docker'])
    .default('docker'),

  // Gemini
  GEMINI_API_KEY: z.string().optional(),
  GEMINI_MODEL: z.string().default('gemini-2.5-flash'),

  // Ollama
  OLLAMA_BASE_URL: z.string().default('http://localhost:11434'),
  OLLAMA_MODEL: z.string().default('llama3.2'),

  // OpenAI
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_BASE_URL: z.string().default('https://api.openai.com/v1'),
  OPENAI_MODEL: z.string().default('gpt-4o-mini'),

  // Docker Model Runner
  // From host (TCP): http://localhost:12434/engines/v1
  // From containers: http://model-runner.docker.internal/engines/v1
  DOCKER_MODEL_BASE_URL: z
    .string()
    .default('http://localhost:12434/engines/v1'),
  DOCKER_MODEL_NAME: z.string().default('ai/qwen3-vl'),
});

export const env = envSchema.parse(process.env);
