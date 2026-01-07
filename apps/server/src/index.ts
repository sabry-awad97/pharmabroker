import { OpenAPIHandler } from '@orpc/openapi/fetch';
import { OpenAPIReferencePlugin } from '@orpc/openapi/plugins';
import { onError } from '@orpc/server';
import { RPCHandler } from '@orpc/server/fetch';
import { ZodToJsonSchemaConverter } from '@orpc/zod/zod4';
import { createContext } from '@pharmabroker/api/context';
import { appRouter } from '@pharmabroker/api/routers/index';
import { getEventBridge } from '@pharmabroker/api/services/event-bridge.service';
import { getWhatsAppWebSocketService } from '@pharmabroker/api/services/whatsapp-ws.service';
import { syncSessionsOnStartup } from '@pharmabroker/api/services/session-sync.service';
import { auth } from '@pharmabroker/auth';
import { env } from '@pharmabroker/env/server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { upgradeWebSocket, websocket } from 'hono/bun';

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

// Initialize Event Bridge on server startup
const eventBridge = getEventBridge({
  wsUrl: env.WHATSAPP_WS_URL,
  apiKey: env.WHATSAPP_API_KEY,
  pingInterval: 30000, // 30 seconds
  pongTimeout: 10000, // 10 seconds
  reconnectDelay: 1000, // 1 second initial
  maxReconnectDelay: 60000, // 60 seconds max
});

// Flag to ensure session sync only runs once on initial startup
let hasRunInitialSync = false;

// Set up onConnected callback - runs on both initial connect and reconnect
eventBridge.onConnected(async () => {
  console.log('[Server] Event Bridge connected');

  // Only sync sessions on initial startup, not on every reconnect
  if (!hasRunInitialSync) {
    hasRunInitialSync = true;
    console.log('[Server] Running initial session sync...');
    await syncSessionsOnStartup();
  }
});

// Start connection (will retry automatically on failure)
eventBridge.connect().catch(error => {
  console.error(
    '[Server] Event Bridge initial connection failed, will retry:',
    error,
  );
  // onConnected callback will be called when it eventually connects
});

// Initialize WhatsApp WebSocket service
getWhatsAppWebSocketService();
console.log('[Server] WhatsApp WebSocket service initialized');

// Export for Bun with WebSocket support
export default {
  fetch: app.fetch,
  websocket,
};
