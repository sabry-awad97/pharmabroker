import type { Context as HonoContext } from 'hono';
import { randomUUID } from 'node:crypto';

import { auth } from '@pharmabroker/auth';

export type CreateContextOptions = {
  context: HonoContext;
};

export async function createContext({ context }: CreateContextOptions) {
  const session = await auth.api.getSession({
    headers: context.req.raw.headers,
  });

  // Generate or extract request ID for tracking
  const requestId = context.req.header('x-request-id') || `req_${randomUUID()}`;

  return {
    session,
    requestId,
  };
}

export type Context = Awaited<ReturnType<typeof createContext>>;
