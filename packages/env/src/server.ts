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
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
});
