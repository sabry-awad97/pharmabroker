import { OpenAPIHandler } from '@orpc/openapi/fetch';
import { OpenAPIReferencePlugin } from '@orpc/openapi/plugins';
import { onError } from '@orpc/server';
import { RPCHandler } from '@orpc/server/fetch';
import { ZodToJsonSchemaConverter } from '@orpc/zod/zod4';
import { createContext } from '@pharmabroker/api/context';
import { appRouter } from '@pharmabroker/api/routers/index';
import {
  initEventBridge,
  getEventBridge,
} from '@pharmabroker/api/services/event-bridge.service';
import { auth } from '@pharmabroker/auth';
import { env } from '@pharmabroker/env/server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';

const app = new Hono();

app.use(logger());
app.use(
  '/*',
  cors({
    origin: env.CORS_ORIGIN,
    allowMethods: ['GET', 'POST', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  }),
);

app.on(['POST', 'GET'], '/api/auth/*', c => auth.handler(c.req.raw));

export const apiHandler = new OpenAPIHandler(appRouter, {
  plugins: [
    new OpenAPIReferencePlugin({
      schemaConverters: [new ZodToJsonSchemaConverter()],
    }),
  ],
  interceptors: [
    onError(error => {
      console.error(error);
    }),
  ],
});

export const rpcHandler = new RPCHandler(appRouter, {
  interceptors: [
    onError(error => {
      console.error(error);
    }),
  ],
});

app.use('/*', async (c, next) => {
  const context = await createContext({ context: c });

  const rpcResult = await rpcHandler.handle(c.req.raw, {
    prefix: '/rpc',
    context: context,
  });

  if (rpcResult.matched) {
    return c.newResponse(rpcResult.response.body, rpcResult.response);
  }

  const apiResult = await apiHandler.handle(c.req.raw, {
    prefix: '/api-reference',
    context: context,
  });

  if (apiResult.matched) {
    return c.newResponse(apiResult.response.body, apiResult.response);
  }

  await next();
});

app.get('/', c => {
  return c.text('OK');
});

// Health check endpoint with event bridge status
app.get('/health/event-bridge', c => {
  try {
    const bridge = getEventBridge();
    const status = bridge.getStatus();
    return c.json({
      status:
        status.connected && status.authenticated ? 'healthy' : 'unhealthy',
      details: status,
    });
  } catch {
    return c.json({
      status: 'not_initialized',
      details: { connected: false, authenticated: false, reconnectAttempts: 0 },
    });
  }
});

// Initialize Event Bridge on server startup
initEventBridge({
  wsUrl: env.WHATSAPP_WS_URL,
  apiKey: env.WHATSAPP_API_KEY,
  pingInterval: 30000, // 30 seconds
  pongTimeout: 10000, // 10 seconds
  reconnectDelay: 1000, // 1 second initial
  maxReconnectDelay: 60000, // 60 seconds max
})
  .then(() => {
    console.log('[Server] Event Bridge connected successfully');
  })
  .catch(error => {
    console.error(
      '[Server] Event Bridge connection failed, will retry:',
      error,
    );
    // The EventBridgeService will automatically retry with exponential backoff
  });

export default app;
