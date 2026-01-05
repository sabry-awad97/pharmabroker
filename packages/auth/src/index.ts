import prisma from '@pharmabroker/db';
import { env } from '@pharmabroker/env/server';
import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';

const isDev = env.NODE_ENV === 'development';

export const auth = betterAuth({
  database: prismaAdapter(prisma, {
    provider: 'postgresql',
  }),

  trustedOrigins: [env.CORS_ORIGIN, 'tauri://localhost', 'http://tauri.localhost'],
  emailAndPassword: {
    enabled: true,
  },
  advanced: {
    defaultCookieAttributes: {
      // In dev: use lax + non-secure for localhost
      // In prod: use none + secure for cross-origin
      sameSite: isDev ? 'lax' : 'none',
      secure: !isDev,
      httpOnly: true,
    },
  },
  plugins: [],
});
