import 'dotenv/config';
import { createEnv } from '@t3-oss/env-core';
import { z } from 'zod';

export const env = createEnv({
  server: {
    DATABASE_URL: z.string().min(1),
    BETTER_AUTH_SECRET: z.string().min(32),
    BETTER_AUTH_URL: z.url(),
    CORS_ORIGIN: z.url(),
    NODE_ENV: z
      .enum(['development', 'production', 'test'])
      .default('development'),
    WHATSAPP_SERVICE_URL: z.url().default('http://localhost:8080'),
    // Event Bridge WebSocket configuration
    WHATSAPP_WS_URL: z.string().default('ws://localhost:8080/ws/events'),
    WHATSAPP_API_KEY: z.string().min(1).default('dev-api-key'),
    // AI Provider configuration
    AI_PROVIDER: z
      .enum(['gemini', 'ollama', 'openai', 'docker'])
      .default('docker'),
    // Gemini configuration (Google AI Studio)
    GEMINI_API_KEY: z.string().optional(),
    GEMINI_MODEL: z.string().default('gemini-2.0-flash'),
    // Ollama configuration (local)
    OLLAMA_BASE_URL: z.string().default('http://localhost:11434'),
    OLLAMA_MODEL: z.string().default('llama3.2'),
    // OpenAI configuration
    OPENAI_API_KEY: z.string().optional(),
    OPENAI_BASE_URL: z.string().default('https://api.openai.com/v1'),
    OPENAI_MODEL: z.string().default('gpt-4o-mini'),
    // Docker Model Runner configuration
    // These are auto-injected by Docker Model Runner when using `models:` in docker-compose
    // Or can be set manually for local development
    // From containers: http://model-runner.docker.internal/engines/v1
    // From host (TCP): http://localhost:12434/engines/v1
    DOCKER_MODEL_BASE_URL: z
      .string()
      .default('http://model-runner.docker.internal/engines/v1'),
    DOCKER_MODEL_NAME: z.string().default('ai/qwen3-vl'),
    // Embedding model configuration (also auto-injected by Docker Model Runner)
    EMBEDDING_PROVIDER: z
      .enum(['gemini', 'ollama', 'openai', 'docker'])
      .default('docker'),
    EMBEDDING_MODEL_URL: z
      .string()
      .default('http://model-runner.docker.internal/engines/v1'),
    EMBEDDING_MODEL_NAME: z.string().default('ai/embeddinggemma'),
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
});
