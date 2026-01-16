import { OpenAPIHandler } from '@orpc/openapi/fetch';
import { OpenAPIReferencePlugin } from '@orpc/openapi/plugins';
import { onError } from '@orpc/server';
import { RPCHandler } from '@orpc/server/fetch';
import { ZodToJsonSchemaConverter } from '@orpc/zod/zod4';
import { createContext } from '@pharmabroker/api/context';
import { appRouter } from '@pharmabroker/api/routers/index';
import { getWhatsAppWebSocketService } from '@pharmabroker/api/services/whatsapp-ws.service';
import { syncSessionsOnStartup } from '@pharmabroker/api/services/session-sync.service';
import { requestFilterMiddleware } from '@pharmabroker/api/middleware/request-filter';
import { auth } from '@pharmabroker/auth';
import { env } from '@pharmabroker/env/server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { upgradeWebSocket, websocket } from 'hono/bun';

const app = new Hono();

app.use(logger());

// Request filter middleware - blocks suspicious scanner requests
// Feature: websocket-architecture-refactor, Requirements: 7.1
app.use('/*', requestFilterMiddleware);

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

// Health check endpoint for Go service WebSocket connections
app.get('/health/whatsapp-ws', c => {
  const wsService = getWhatsAppWebSocketService();
  const status = wsService.getStatus();
  return c.json({
    status: status.connected ? 'healthy' : 'waiting',
    details: status,
  });
});

// WebSocket endpoint for Go WhatsApp service to connect
// This allows the Go service to push events to the API
app.get(
  '/ws/whatsapp',
  upgradeWebSocket(() => {
    const wsService = getWhatsAppWebSocketService();

    return {
      onOpen(_event, ws) {
        wsService.handleOpen(ws as any);
      },
      onMessage(event, ws) {
        const message =
          typeof event.data === 'string' ? event.data : String(event.data);
        wsService.handleMessage(ws as any, message);
      },
      onClose(_event, ws) {
        wsService.handleClose(ws);
      },
    };
  }),
);

// Initialize WhatsApp WebSocket service with session sync callback
// Session sync runs when Go service connects and authenticates
const wsService = getWhatsAppWebSocketService();
wsService.onConnected(async () => {
  console.log('[Server] Go service connected, running session sync...');
  await syncSessionsOnStartup();
});
console.log('[Server] WhatsApp WebSocket service initialized');

// Export for Bun with WebSocket support
export default {
  fetch: app.fetch,
  websocket,
};
