# PharmaBroker Professional Improvement Tasks

> Comprehensive task specifications for production-readiness of the PharmaBroker pharmaceutical trading platform.

## Executive Summary

This document contains **22 improvement tasks** across **6 categories**, organized by priority for securing, optimizing, and hardening the PharmaBroker system.

| Category | Tasks | Critical | High | Medium | Low | Total Effort |
|----------|-------|----------|------|--------|-----|--------------|
| Security | 6 | 3 | 2 | 1 | 0 | ~22h |
| Reliability | 4 | 0 | 2 | 2 | 0 | ~25h |
| Performance | 4 | 0 | 0 | 3 | 1 | ~10h |
| Code Quality | 3 | 0 | 0 | 2 | 1 | ~10h |
| Testing | 2 | 0 | 0 | 2 | 0 | ~10h |
| Compliance | 3 | 0 | 1 | 2 | 0 | ~13h |
| **Total** | **22** | **3** | **5** | **12** | **2** | **~90h** |

---

## Priority Legend

| Priority | Description | Response Time |
|----------|-------------|---------------|
| **P0 - CRITICAL** | Security vulnerabilities, data loss risk | Immediate |
| **P1 - HIGH** | Major functionality gaps, significant risk | Within 1 week |
| **P2 - MEDIUM** | Important improvements, moderate impact | Within 2 weeks |
| **P3 - LOW** | Nice-to-have, minor improvements | When available |

---

## Category 1: Security (SEC)

### SEC001: Fix WebSocket Authentication Gap

| Attribute | Value |
|-----------|-------|
| **Priority** | P0 - CRITICAL |
| **Complexity** | Low |
| **Estimated Effort** | 2 hours |
| **Component** | API Gateway |

#### Problem Statement

When `WHATSAPP_API_KEY` is not configured, the WebSocket service accepts ALL connections without authentication, allowing malicious actors to inject events into the system.

#### Files to Modify

| File | Purpose |
|------|---------|
| `packages/api/src/services/whatsapp-ws.service.ts` (Lines 238-284) | Fix authentication logic |

#### Deliverables

1. Modify `handleAuth()` to reject connections when API key is not configured
2. Add startup validation that warns/fails if API key is missing
3. Add unit test for authentication rejection scenario

#### Acceptance Criteria

- [ ] Connections are rejected with code `4001` when API key is unset
- [ ] Server logs error on startup if API key is missing in production
- [ ] Test coverage for auth scenarios ≥ 95%

#### Implementation

```typescript
private handleAuth(client: WebSocketClient, auth: AuthMessage): void {
  // Fail-closed: require API key to be configured
  if (!this.apiKey || this.apiKey.length < 32) {
    this.log.error('WebSocket API key not configured or too short');
    const response: AuthResponse = {
      type: 'auth_response',
      success: false,
      message: 'Server authentication not configured',
    };
    client.ws.send(JSON.stringify(response));
    client.ws.close(4001, 'Server configuration error');
    return;
  }

  // Validate the provided API key
  const isValid = auth.api_key === this.apiKey;

  if (isValid) {
    client.authenticated = true;
    const response: AuthResponse = {
      type: 'auth_response',
      success: true,
      message: 'Authentication successful',
    };
    client.ws.send(JSON.stringify(response));
    this.log.info('Client authenticated successfully');
    // ... rest of existing logic
  } else {
    const response: AuthResponse = {
      type: 'auth_response',
      success: false,
      message: 'Invalid API key',
    };
    client.ws.send(JSON.stringify(response));
    this.log.warn('Authentication failed: invalid API key');
    setTimeout(() => client.ws.close(4001, 'Invalid API key'), 100);
  }
}
```

---

### SEC002: Remove Default API Key

| Attribute | Value |
|-----------|-------|
| **Priority** | P0 - CRITICAL |
| **Complexity** | Low |
| **Estimated Effort** | 1 hour |
| **Component** | Environment Configuration |

#### Problem Statement

Default `dev-api-key` could leak into production, allowing unauthorized access to the system.

#### Files to Modify

| File | Purpose |
|------|---------|
| `packages/env/src/server.ts` (Line 17) | Remove default value |
| `.env.example` | Document requirement |

#### Deliverables

1. Remove `.default()` from `WHATSAPP_API_KEY` schema
2. Add minimum length validation (32 characters)
3. Update `.env.example` with generation instructions

#### Acceptance Criteria

- [ ] Server fails to start without `WHATSAPP_API_KEY`
- [ ] Minimum 32 character requirement enforced
- [ ] Documentation updated with key generation command

#### Implementation

```typescript
// packages/env/src/server.ts
WHATSAPP_API_KEY: z
  .string()
  .min(32, 'WHATSAPP_API_KEY must be at least 32 characters'),
```

```bash
# .env.example
# Generate with: openssl rand -base64 32
WHATSAPP_API_KEY=
```

---

### SEC003: Fix CORS Wildcard Default

| Attribute | Value |
|-----------|-------|
| **Priority** | P0 - CRITICAL |
| **Complexity** | Low |
| **Estimated Effort** | 1 hour |
| **Component** | WhatsApp Service (Go) |

#### Problem Statement

Go service defaults to `cors.allowed_origins: ["*"]` which bypasses browser security and allows any origin to make requests.

#### Files to Modify

| File | Purpose |
|------|---------|
| `service/whatsapp/internal/infrastructure/config/config.go` (Line 332) | Remove wildcard default |
| `service/whatsapp/docs/SECURITY.md` | Update documentation |

#### Deliverables

1. Remove wildcard default, require explicit origins
2. Add validation that fails if origins list is empty in production
3. Update security documentation

#### Acceptance Criteria

- [ ] Service fails to start with empty origins in production mode
- [ ] Wildcard only allowed when explicitly set AND in development mode
- [ ] SECURITY.md updated with configuration examples

#### Implementation

```go
// config.go - setDefaults function
func setDefaults(v *viper.Viper) {
    // CORS defaults - no wildcard in production
    v.SetDefault("cors.allowed_origins", []string{}) // Empty by default
    // ...
}

// Validate function addition
func (c *Config) Validate() error {
    // ... existing validation ...
    
    // Validate CORS in production
    if os.Getenv("GO_ENV") == "production" {
        if len(c.CORS.AllowedOrigins) == 0 {
            errs = append(errs, ValidationError{
                Field:   "cors.allowed_origins",
                Message: "must specify allowed origins in production",
            })
        }
        for _, origin := range c.CORS.AllowedOrigins {
            if origin == "*" {
                errs = append(errs, ValidationError{
                    Field:   "cors.allowed_origins",
                    Message: "wildcard origin not allowed in production",
                })
            }
        }
    }
    // ...
}
```

---

### SEC004: Implement API Rate Limiting on Node.js Gateway

| Attribute | Value |
|-----------|-------|
| **Priority** | P1 - HIGH |
| **Complexity** | Medium |
| **Estimated Effort** | 4 hours |
| **Component** | API Gateway |

#### Problem Statement

Rate limiting middleware exists but is NOT applied to the Hono server, allowing API abuse and potential DoS attacks.

#### Files to Modify

| File | Purpose |
|------|---------|
| `apps/server/src/index.ts` | Apply middleware |
| `packages/api/src/middleware/rate-limit.ts` | Enhance for Hono compatibility |

#### Deliverables

1. Create Hono-compatible rate limiting middleware
2. Apply to all API routes with configurable limits
3. Add rate limit headers to responses
4. Add bypass for health check endpoints

#### Acceptance Criteria

- [ ] Rate limit headers present on all responses (`X-RateLimit-*`)
- [ ] Returns 429 when limit exceeded with `Retry-After` header
- [ ] Configurable via environment variables
- [ ] `/health` endpoints bypass rate limiting

#### Implementation

```typescript
// packages/api/src/middleware/rate-limit.ts
import type { Context, Next } from 'hono';

export interface HonoRateLimitConfig {
  maxRequests: number;
  windowMs: number;
  message?: string;
  skip?: (c: Context) => boolean;
}

export function createHonoRateLimitMiddleware(config: HonoRateLimitConfig) {
  const limiter = new RateLimiter({
    maxRequests: config.maxRequests,
    windowMs: config.windowMs,
    message: config.message,
  });

  return async (c: Context, next: Next) => {
    // Skip health checks
    if (config.skip?.(c) || c.req.path.startsWith('/health')) {
      return next();
    }

    const key = getClientIp(c);
    const result = limiter.check(key);

    // Set rate limit headers
    c.header('X-RateLimit-Limit', String(config.maxRequests));
    c.header('X-RateLimit-Remaining', String(result.remaining));
    c.header('X-RateLimit-Reset', String(result.resetAt));

    if (!result.allowed) {
      const retryAfter = Math.ceil((result.resetAt - Date.now()) / 1000);
      c.header('Retry-After', String(retryAfter));
      return c.json(
        { 
          error: 'RATE_LIMIT_EXCEEDED',
          message: config.message ?? 'Too many requests',
          retryAfter 
        }, 
        429
      );
    }

    return next();
  };
}

function getClientIp(c: Context): string {
  const forwarded = c.req.header('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0]?.trim() ?? 'unknown';
  }
  return c.req.header('x-real-ip') ?? 'unknown';
}
```

```typescript
// apps/server/src/index.ts
import { createHonoRateLimitMiddleware } from '@pharmabroker/api/middleware/rate-limit';

const app = new Hono();

// Apply rate limiting early in the middleware chain
app.use('/*', createHonoRateLimitMiddleware({
  maxRequests: 100,
  windowMs: 60 * 1000, // 1 minute
  skip: (c) => c.req.path === '/' || c.req.path.startsWith('/health'),
}));
```

---

### SEC005: Add Request Signing for Inter-Service Communication

| Attribute | Value |
|-----------|-------|
| **Priority** | P1 - HIGH |
| **Complexity** | High |
| **Estimated Effort** | 8 hours |
| **Component** | API Gateway + WhatsApp Service |

#### Problem Statement

Communication between Node.js API and Go service uses simple API key authentication. HMAC signing provides replay attack protection and request integrity verification.

#### Files to Modify

| File | Purpose |
|------|---------|
| `packages/api/src/services/whatsapp.service.ts` | Add request signing |
| `service/whatsapp/internal/presentation/http/middleware.go` | Verify signatures |
| `packages/api/src/utils/request-signing.ts` | New utility file |

#### Deliverables

1. Create request signing utility using HMAC-SHA256
2. Add timestamp to prevent replay attacks (5-minute window)
3. Implement signature verification in Go middleware
4. Add configuration for shared secret

#### Acceptance Criteria

- [ ] All inter-service requests signed with HMAC-SHA256
- [ ] Requests older than 5 minutes rejected
- [ ] Signature mismatch returns 401
- [ ] Shared secret rotatable without downtime

#### Implementation

```typescript
// packages/api/src/utils/request-signing.ts
import { createHmac } from 'crypto';

export interface SignedRequestHeaders {
  'X-Timestamp': string;
  'X-Signature': string;
  'X-API-Key': string;
}

export function signRequest(
  method: string,
  path: string,
  body: string | undefined,
  secret: string,
  apiKey: string
): SignedRequestHeaders {
  const timestamp = Date.now().toString();
  const payload = `${timestamp}:${method}:${path}:${body ?? ''}`;
  
  const signature = createHmac('sha256', secret)
    .update(payload)
    .digest('hex');

  return {
    'X-Timestamp': timestamp,
    'X-Signature': signature,
    'X-API-Key': apiKey,
  };
}

export function verifySignature(
  method: string,
  path: string,
  body: string | undefined,
  timestamp: string,
  signature: string,
  secret: string,
  maxAgeMs: number = 5 * 60 * 1000
): boolean {
  // Check timestamp freshness
  const requestTime = parseInt(timestamp, 10);
  if (isNaN(requestTime) || Date.now() - requestTime > maxAgeMs) {
    return false;
  }

  // Verify signature
  const payload = `${timestamp}:${method}:${path}:${body ?? ''}`;
  const expectedSignature = createHmac('sha256', secret)
    .update(payload)
    .digest('hex');

  return signature === expectedSignature;
}
```

```go
// service/whatsapp/internal/presentation/http/middleware.go
func SignatureVerificationMiddleware(secret string) gin.HandlerFunc {
    return func(c *gin.Context) {
        timestamp := c.GetHeader("X-Timestamp")
        signature := c.GetHeader("X-Signature")
        
        if timestamp == "" || signature == "" {
            c.JSON(http.StatusUnauthorized, dto.NewErrorResponse[interface{}](
                "MISSING_SIGNATURE",
                "Request signature required",
                nil,
            ))
            c.Abort()
            return
        }

        // Check timestamp (5 minute window)
        ts, err := strconv.ParseInt(timestamp, 10, 64)
        if err != nil || time.Now().UnixMilli()-ts > 5*60*1000 {
            c.JSON(http.StatusUnauthorized, dto.NewErrorResponse[interface{}](
                "EXPIRED_REQUEST",
                "Request timestamp expired",
                nil,
            ))
            c.Abort()
            return
        }

        // Read body for signature verification
        body, _ := io.ReadAll(c.Request.Body)
        c.Request.Body = io.NopCloser(bytes.NewBuffer(body))

        // Compute expected signature
        payload := fmt.Sprintf("%s:%s:%s:%s", 
            timestamp, c.Request.Method, c.Request.URL.Path, string(body))
        mac := hmac.New(sha256.New, []byte(secret))
        mac.Write([]byte(payload))
        expectedSig := hex.EncodeToString(mac.Sum(nil))

        if !hmac.Equal([]byte(signature), []byte(expectedSig)) {
            c.JSON(http.StatusUnauthorized, dto.NewErrorResponse[interface{}](
                "INVALID_SIGNATURE",
                "Request signature invalid",
                nil,
            ))
            c.Abort()
            return
        }

        c.Next()
    }
}
```

---

### SEC006: Implement Audit Logging for Sensitive Operations

| Attribute | Value |
|-----------|-------|
| **Priority** | P2 - MEDIUM |
| **Complexity** | Medium |
| **Estimated Effort** | 6 hours |
| **Component** | API Gateway + Database |

#### Problem Statement

Healthcare applications require audit trails for compliance. Currently no structured logging for sensitive operations like session management, message sending, or AI processing.

#### Files to Create/Modify

| File | Purpose |
|------|---------|
| `packages/api/src/services/audit.service.ts` | New audit service |
| `packages/db/prisma/schema/auth.prisma` | Add AuditLog model |
| `packages/api/src/routers/whatsapp.router.ts` | Add audit calls |

#### Deliverables

1. Create `AuditLog` Prisma model
2. Create audit service with typed action categories
3. Integrate with session create/delete, message send, AI processing
4. Add audit log query endpoint for admins

#### Acceptance Criteria

- [ ] All CRUD operations on sessions/messages logged
- [ ] AI processing operations logged with model/duration
- [ ] Logs retained for 90 days (configurable)
- [ ] Query endpoint with filtering by action/user/date

#### Implementation

```prisma
// packages/db/prisma/schema/auth.prisma

model AuditLog {
  id         String   @id @default(uuid())
  userId     String   @map("user_id")
  user       User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  
  action     String   // e.g., "session.create", "message.send", "ai.process"
  resource   String   // e.g., "WhatsAppSession", "WhatsAppMessage"
  resourceId String?  @map("resource_id")
  
  metadata   Json?    // Additional context (e.g., { model: "gpt-4o", duration: 1500 })
  ipAddress  String?  @map("ip_address")
  userAgent  String?  @map("user_agent")
  
  status     String   @default("success") // "success", "failure"
  errorMsg   String?  @map("error_message")
  
  createdAt  DateTime @default(now()) @map("created_at")
  
  @@index([userId])
  @@index([action])
  @@index([resource, resourceId])
  @@index([createdAt])
  @@map("audit_log")
}
```

```typescript
// packages/api/src/services/audit.service.ts
import prisma from '@pharmabroker/db';
import { logger } from '@pharmabroker/logger';

export type AuditAction =
  | 'session.create'
  | 'session.delete'
  | 'session.connect'
  | 'session.disconnect'
  | 'message.send'
  | 'message.receive'
  | 'ai.process'
  | 'ai.retry'
  | 'group.sync'
  | 'user.login'
  | 'user.logout';

export interface AuditLogEntry {
  userId: string;
  action: AuditAction;
  resource: string;
  resourceId?: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
  status?: 'success' | 'failure';
  errorMsg?: string;
}

class AuditService {
  private log = logger.child('audit');

  async log(entry: AuditLogEntry): Promise<void> {
    try {
      await prisma.auditLog.create({
        data: {
          userId: entry.userId,
          action: entry.action,
          resource: entry.resource,
          resourceId: entry.resourceId,
          metadata: entry.metadata,
          ipAddress: entry.ipAddress,
          userAgent: entry.userAgent,
          status: entry.status ?? 'success',
          errorMsg: entry.errorMsg,
        },
      });

      this.log.debug('Audit log created', {
        action: entry.action,
        resource: entry.resource,
        resourceId: entry.resourceId,
      });
    } catch (error) {
      // Don't fail the operation if audit logging fails
      this.log.error('Failed to create audit log', {
        error: error instanceof Error ? error.message : String(error),
        entry,
      });
    }
  }

  async query(filters: {
    userId?: string;
    action?: string;
    resource?: string;
    startDate?: Date;
    endDate?: Date;
    limit?: number;
    offset?: number;
  }) {
    return prisma.auditLog.findMany({
      where: {
        userId: filters.userId,
        action: filters.action,
        resource: filters.resource,
        createdAt: {
          gte: filters.startDate,
          lte: filters.endDate,
        },
      },
      orderBy: { createdAt: 'desc' },
      take: filters.limit ?? 100,
      skip: filters.offset ?? 0,
    });
  }
}

export const auditService = new AuditService();
```

---

## Category 2: Reliability (REL)

### REL001: Implement Message Queue Persistence

| Attribute | Value |
|-----------|-------|
| **Priority** | P1 - HIGH |
| **Complexity** | High |
| **Estimated Effort** | 12 hours |
| **Component** | API Gateway + Database |

#### Problem Statement

In-memory message queue in `whatsapp-ws.service.ts` loses data on crash/restart, potentially causing message loss during sync operations.

#### Files to Modify

| File | Purpose |
|------|---------|
| `packages/api/src/services/message-queue.service.ts` | Add persistence layer |
| `packages/db/prisma/schema/whatsapp.prisma` | Add queue table |

#### Deliverables

1. Create `WhatsAppMessageQueue` table for pending messages
2. Persist messages before acknowledgment
3. Recover unprocessed messages on startup
4. Add cleanup for processed messages (batch delete)

#### Acceptance Criteria

- [ ] No message loss on service restart
- [ ] Recovery completes within 30 seconds of startup
- [ ] Queue size limits enforced (configurable max)
- [ ] Metrics for queue depth/latency

#### Implementation

```prisma
// packages/db/prisma/schema/whatsapp.prisma

model WhatsAppMessageQueue {
  id          String      @id @default(uuid())
  sessionId   String      @map("session_id")
  payload     Json        // Full message payload
  status      QueueStatus @default(pending)
  attempts    Int         @default(0)
  maxAttempts Int         @default(3) @map("max_attempts")
  error       String?
  createdAt   DateTime    @default(now()) @map("created_at")
  processedAt DateTime?   @map("processed_at")
  
  @@index([sessionId, status])
  @@index([status, createdAt])
  @@map("whatsapp_message_queue")
}

enum QueueStatus {
  pending
  processing
  completed
  failed
  dead_letter
  
  @@map("queue_status")
}
```

```typescript
// packages/api/src/services/message-queue.service.ts
import prisma from '@pharmabroker/db';
import { logger } from '@pharmabroker/logger';

class PersistentMessageQueueService {
  private log = logger.child('message-queue');
  private inMemoryQueue: Map<string, unknown[]> = new Map();
  private readonly MAX_QUEUE_SIZE = 10000;

  /**
   * Enqueue a message with persistence
   */
  async enqueue(sessionId: string, message: unknown): Promise<void> {
    // Check queue size limit
    const currentSize = await prisma.whatsAppMessageQueue.count({
      where: { sessionId, status: 'pending' },
    });

    if (currentSize >= this.MAX_QUEUE_SIZE) {
      this.log.warn('Queue size limit reached', { sessionId, currentSize });
      throw new Error('Queue size limit exceeded');
    }

    // Persist to database
    await prisma.whatsAppMessageQueue.create({
      data: {
        sessionId,
        payload: message as any,
        status: 'pending',
      },
    });
  }

  /**
   * Drain all pending messages for a session
   */
  async drain(sessionId: string): Promise<unknown[]> {
    // Mark as processing
    const messages = await prisma.whatsAppMessageQueue.findMany({
      where: { sessionId, status: 'pending' },
      orderBy: { createdAt: 'asc' },
    });

    if (messages.length === 0) {
      return [];
    }

    // Update status to processing
    await prisma.whatsAppMessageQueue.updateMany({
      where: { id: { in: messages.map(m => m.id) } },
      data: { status: 'processing' },
    });

    return messages.map(m => m.payload);
  }

  /**
   * Mark messages as completed
   */
  async complete(sessionId: string): Promise<void> {
    await prisma.whatsAppMessageQueue.updateMany({
      where: { sessionId, status: 'processing' },
      data: { 
        status: 'completed',
        processedAt: new Date(),
      },
    });
  }

  /**
   * Recover unprocessed messages on startup
   */
  async recover(): Promise<void> {
    // Reset any stuck "processing" messages back to pending
    const result = await prisma.whatsAppMessageQueue.updateMany({
      where: { status: 'processing' },
      data: { status: 'pending' },
    });

    if (result.count > 0) {
      this.log.info('Recovered stuck messages', { count: result.count });
    }
  }

  /**
   * Cleanup old completed messages
   */
  async cleanup(olderThanHours: number = 24): Promise<number> {
    const cutoff = new Date(Date.now() - olderThanHours * 60 * 60 * 1000);
    
    const result = await prisma.whatsAppMessageQueue.deleteMany({
      where: {
        status: 'completed',
        processedAt: { lt: cutoff },
      },
    });

    return result.count;
  }

  /**
   * Get queue statistics
   */
  async getStats(sessionId?: string) {
    const where = sessionId ? { sessionId } : {};
    
    const [pending, processing, completed, failed] = await Promise.all([
      prisma.whatsAppMessageQueue.count({ where: { ...where, status: 'pending' } }),
      prisma.whatsAppMessageQueue.count({ where: { ...where, status: 'processing' } }),
      prisma.whatsAppMessageQueue.count({ where: { ...where, status: 'completed' } }),
      prisma.whatsAppMessageQueue.count({ where: { ...where, status: 'failed' } }),
    ]);

    return { pending, processing, completed, failed };
  }
}

export const persistentQueueService = new PersistentMessageQueueService();
```

---

### REL002: Add Circuit Breaker to AI Client

| Attribute | Value |
|-----------|-------|
| **Priority** | P1 - HIGH |
| **Complexity** | Medium |
| **Estimated Effort** | 6 hours |
| **Component** | AI Engine |

#### Problem Statement

AI provider failures cascade through the system with no automatic recovery or fallback mechanism. A single provider outage can block all message processing.

#### Files to Modify

| File | Purpose |
|------|---------|
| `packages/ai/src/client.ts` | Integrate circuit breaker |
| `packages/ai/src/circuit-breaker.ts` | New file |

#### Deliverables

1. Implement circuit breaker with states: CLOSED, OPEN, HALF_OPEN
2. Configure thresholds: 5 failures opens, 30s timeout, 2 successes closes
3. Add metrics for circuit state transitions
4. Optional: Add fallback provider support

#### Acceptance Criteria

- [ ] Circuit opens after 5 consecutive failures
- [ ] Requests fail-fast when circuit is open (no API call made)
- [ ] Circuit attempts recovery after 30 seconds
- [ ] State exposed via health check endpoint

#### Implementation

```typescript
// packages/ai/src/circuit-breaker.ts

export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface CircuitBreakerConfig {
  failureThreshold: number;     // Failures to trigger open (default: 5)
  successThreshold: number;     // Successes to close from half-open (default: 2)
  timeout: number;              // Ms before attempting recovery (default: 30000)
  onStateChange?: (from: CircuitState, to: CircuitState) => void;
}

export class CircuitBreakerError extends Error {
  constructor(message: string, public readonly state: CircuitState) {
    super(message);
    this.name = 'CircuitBreakerError';
  }
}

export class CircuitBreaker {
  private state: CircuitState = 'CLOSED';
  private failures = 0;
  private successes = 0;
  private lastFailureTime = 0;
  private config: Required<CircuitBreakerConfig>;

  constructor(config: Partial<CircuitBreakerConfig> = {}) {
    this.config = {
      failureThreshold: config.failureThreshold ?? 5,
      successThreshold: config.successThreshold ?? 2,
      timeout: config.timeout ?? 30000,
      onStateChange: config.onStateChange ?? (() => {}),
    };
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    // Check if circuit should transition from OPEN to HALF_OPEN
    if (this.state === 'OPEN') {
      if (Date.now() - this.lastFailureTime >= this.config.timeout) {
        this.transitionTo('HALF_OPEN');
      } else {
        throw new CircuitBreakerError(
          'Circuit breaker is open - failing fast',
          this.state
        );
      }
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess(): void {
    if (this.state === 'HALF_OPEN') {
      this.successes++;
      if (this.successes >= this.config.successThreshold) {
        this.transitionTo('CLOSED');
      }
    } else if (this.state === 'CLOSED') {
      // Reset failure count on success
      this.failures = 0;
    }
  }

  private onFailure(): void {
    this.lastFailureTime = Date.now();

    if (this.state === 'HALF_OPEN') {
      // Any failure in half-open returns to open
      this.transitionTo('OPEN');
    } else if (this.state === 'CLOSED') {
      this.failures++;
      if (this.failures >= this.config.failureThreshold) {
        this.transitionTo('OPEN');
      }
    }
  }

  private transitionTo(newState: CircuitState): void {
    const oldState = this.state;
    this.state = newState;
    
    // Reset counters
    if (newState === 'CLOSED') {
      this.failures = 0;
      this.successes = 0;
    } else if (newState === 'HALF_OPEN') {
      this.successes = 0;
    }

    this.config.onStateChange(oldState, newState);
  }

  getState(): CircuitState {
    return this.state;
  }

  getStats() {
    return {
      state: this.state,
      failures: this.failures,
      successes: this.successes,
      lastFailureTime: this.lastFailureTime,
    };
  }

  reset(): void {
    this.transitionTo('CLOSED');
  }
}
```

```typescript
// packages/ai/src/client.ts - Integration
import { CircuitBreaker, CircuitBreakerError } from './circuit-breaker';
import { aiCircuitBreakerState } from '@pharmabroker/metrics';

export class AIClient {
  private provider: AIProvider;
  private circuitBreaker: CircuitBreaker;
  // ...

  constructor(config: AIClientConfig = {}) {
    this.provider = config.provider
      ? createProvider(config.provider, config.envConfig)
      : getDefaultProvider(config.envConfig);

    this.circuitBreaker = new CircuitBreaker({
      failureThreshold: 5,
      successThreshold: 2,
      timeout: 30000,
      onStateChange: (from, to) => {
        console.log(`[AI Client] Circuit breaker: ${from} -> ${to}`);
        aiCircuitBreakerState.set({ state: to }, to === 'OPEN' ? 1 : 0);
      },
    });
    // ...
  }

  async processMessage<T>(
    message: MessageInput,
    options: ProcessMessageOptions<T>,
  ): Promise<ProcessingResult & { data: T | null; debug?: ProcessingDebugInfo }> {
    try {
      return await this.circuitBreaker.execute(() =>
        this.processMessageInternal(message, options)
      );
    } catch (error) {
      if (error instanceof CircuitBreakerError) {
        return {
          messageId: message.id,
          status: 'failed',
          model: this.modelName,
          extractions: [],
          data: null,
          error: `AI service unavailable: ${error.message}`,
          processingTimeMs: 0,
        };
      }
      throw error;
    }
  }
  // ...
}
```

---

### REL003: Implement Graceful Shutdown for All Services

| Attribute | Value |
|-----------|-------|
| **Priority** | P2 - MEDIUM |
| **Complexity** | Medium |
| **Estimated Effort** | 4 hours |
| **Component** | API Gateway + WhatsApp Service |

#### Problem Statement

Services may terminate mid-operation during deployments, causing data corruption, lost connections, or failed requests.

#### Files to Modify

| File | Purpose |
|------|---------|
| `apps/server/src/index.ts` | Add shutdown handler |
| `service/whatsapp/cmd/whatsapp/main.go` | Verify fx shutdown hooks |

#### Deliverables

1. Add SIGTERM/SIGINT handlers to Node.js server
2. Drain in-flight requests before shutdown
3. Close WebSocket connections gracefully
4. Flush pending database writes

#### Acceptance Criteria

- [ ] No 502/503 errors during rolling deployment
- [ ] WebSocket clients receive close frame before termination
- [ ] All pending writes complete or are logged
- [ ] Shutdown completes within 30 seconds

#### Implementation

```typescript
// apps/server/src/index.ts

import { getWhatsAppWebSocketService } from '@pharmabroker/api/services/whatsapp-ws.service';

// Track server state
let isShuttingDown = false;
const activeRequests = new Set<string>();

// Graceful shutdown handler
async function shutdown(signal: string) {
  if (isShuttingDown) return;
  isShuttingDown = true;

  console.log(`[Server] Received ${signal}, starting graceful shutdown...`);

  // 1. Stop accepting new connections
  // Bun doesn't have a built-in way, but we can reject new requests
  
  // 2. Close WebSocket connections
  const wsService = getWhatsAppWebSocketService();
  console.log('[Server] Closing WebSocket connections...');
  // wsService.closeAllConnections(); // Implement this method

  // 3. Wait for active requests (max 25 seconds)
  const shutdownTimeout = 25000;
  const startTime = Date.now();
  
  while (activeRequests.size > 0 && Date.now() - startTime < shutdownTimeout) {
    console.log(`[Server] Waiting for ${activeRequests.size} active requests...`);
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  if (activeRequests.size > 0) {
    console.warn(`[Server] Force shutdown with ${activeRequests.size} pending requests`);
  }

  // 4. Flush any pending operations
  console.log('[Server] Flushing pending operations...');
  // await flushPendingWrites();

  console.log('[Server] Shutdown complete');
  process.exit(0);
}

// Register signal handlers
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Middleware to track active requests
app.use('/*', async (c, next) => {
  if (isShuttingDown) {
    return c.json({ error: 'Service shutting down' }, 503);
  }

  const requestId = crypto.randomUUID();
  activeRequests.add(requestId);

  try {
    await next();
  } finally {
    activeRequests.delete(requestId);
  }
});
```

---

### REL004: Add Health Check Aggregation Endpoint

| Attribute | Value |
|-----------|-------|
| **Priority** | P2 - MEDIUM |
| **Complexity** | Low |
| **Estimated Effort** | 3 hours |
| **Component** | API Gateway |

#### Problem Statement

No single endpoint shows health of all system components, making it difficult to diagnose issues and configure orchestrator health checks.

#### Files to Modify

| File | Purpose |
|------|---------|
| `apps/server/src/index.ts` | Add aggregate endpoint |
| `packages/api/src/services/health.service.ts` | New health service |

#### Deliverables

1. Create `/health/full` endpoint aggregating all services
2. Check: PostgreSQL, AI provider, WhatsApp Go service, WebSocket
3. Return structured JSON with component status and latency
4. Add Kubernetes-compatible liveness/readiness probes

#### Acceptance Criteria

- [ ] `/health/live` returns 200 if process is running
- [ ] `/health/ready` returns 200 if all dependencies are healthy
- [ ] `/health/full` returns detailed component status
- [ ] Individual component failures don't crash the endpoint

#### Implementation

```typescript
// packages/api/src/services/health.service.ts
import prisma from '@pharmabroker/db';
import { getAIClient } from '@pharmabroker/ai';
import { getWhatsAppWebSocketService } from './whatsapp-ws.service';
import { env } from '@pharmabroker/env/server';

export interface ComponentHealth {
  status: 'healthy' | 'degraded' | 'unhealthy';
  latency_ms?: number;
  message?: string;
  details?: Record<string, unknown>;
}

export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  version?: string;
  components: {
    database: ComponentHealth;
    ai_provider: ComponentHealth;
    whatsapp_service: ComponentHealth;
    websocket: ComponentHealth;
  };
}

class HealthService {
  async checkDatabase(): Promise<ComponentHealth> {
    const start = Date.now();
    try {
      await prisma.$queryRaw`SELECT 1`;
      return {
        status: 'healthy',
        latency_ms: Date.now() - start,
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        latency_ms: Date.now() - start,
        message: error instanceof Error ? error.message : 'Database check failed',
      };
    }
  }

  async checkAIProvider(): Promise<ComponentHealth> {
    const start = Date.now();
    try {
      const client = getAIClient();
      // Simple check - verify client is configured
      const providerName = client.providerName;
      return {
        status: 'healthy',
        latency_ms: Date.now() - start,
        details: { provider: providerName },
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        latency_ms: Date.now() - start,
        message: error instanceof Error ? error.message : 'AI provider check failed',
      };
    }
  }

  async checkWhatsAppService(): Promise<ComponentHealth> {
    const start = Date.now();
    try {
      const response = await fetch(`${env.WHATSAPP_SERVICE_URL}/health`, {
        signal: AbortSignal.timeout(5000),
      });
      
      if (!response.ok) {
        return {
          status: 'unhealthy',
          latency_ms: Date.now() - start,
          message: `HTTP ${response.status}`,
        };
      }

      return {
        status: 'healthy',
        latency_ms: Date.now() - start,
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        latency_ms: Date.now() - start,
        message: error instanceof Error ? error.message : 'WhatsApp service unreachable',
      };
    }
  }

  checkWebSocket(): ComponentHealth {
    const wsService = getWhatsAppWebSocketService();
    const status = wsService.getStatus();

    return {
      status: status.connected ? 'healthy' : 'degraded',
      details: {
        connected: status.connected,
        totalConnections: status.totalConnections,
        authenticatedConnections: status.authenticatedConnections,
      },
    };
  }

  async getFullHealth(): Promise<HealthStatus> {
    const [database, ai_provider, whatsapp_service] = await Promise.all([
      this.checkDatabase(),
      this.checkAIProvider(),
      this.checkWhatsAppService(),
    ]);

    const websocket = this.checkWebSocket();

    const components = { database, ai_provider, whatsapp_service, websocket };

    // Determine overall status
    const statuses = Object.values(components).map(c => c.status);
    let overallStatus: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
    
    if (statuses.includes('unhealthy')) {
      overallStatus = 'unhealthy';
    } else if (statuses.includes('degraded')) {
      overallStatus = 'degraded';
    }

    return {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version,
      components,
    };
  }

  async isReady(): Promise<boolean> {
    const health = await this.getFullHealth();
    return health.status !== 'unhealthy';
  }
}

export const healthService = new HealthService();
```

```typescript
// apps/server/src/index.ts - Add health endpoints
import { healthService } from '@pharmabroker/api/services/health.service';

// Kubernetes liveness probe - is the process running?
app.get('/health/live', c => c.text('OK'));

// Kubernetes readiness probe - can we serve traffic?
app.get('/health/ready', async c => {
  const isReady = await healthService.isReady();
  if (isReady) {
    return c.text('OK');
  }
  return c.text('NOT READY', 503);
});

// Detailed health check
app.get('/health/full', async c => {
  const health = await healthService.getFullHealth();
  const statusCode = health.status === 'healthy' ? 200 : 
                     health.status === 'degraded' ? 200 : 503;
  return c.json(health, statusCode);
});
```

---

## Category 3: Performance (PERF)

### PERF001: Implement LRU Cache with Size Limits

| Attribute | Value |
|-----------|-------|
| **Priority** | P2 - MEDIUM |
| **Complexity** | Low |
| **Estimated Effort** | 2 hours |
| **Component** | API Gateway + Frontend |

#### Problem Statement

In-memory `Map` objects used for deduplication grow unbounded, causing memory leaks in long-running processes.

#### Files to Modify

| File | Purpose |
|------|---------|
| `packages/api/src/services/whatsapp-ws.service.ts` (Lines 108-110) | Replace Map with LRU |
| `apps/web/src/hooks/use-realtime-sync.ts` (Line 57) | Replace Map with LRU |
| `package.json` | Add lru-cache dependency |

#### Deliverables

1. Add `lru-cache` package to dependencies
2. Replace `Map` with `LRUCache` with max 10,000 entries and 10-minute TTL
3. Add cache hit/miss metrics

#### Acceptance Criteria

- [ ] Memory usage stable under sustained load
- [ ] Cache size metrics exposed
- [ ] No functional change to deduplication behavior

#### Implementation

```bash
# Install dependency
bun add lru-cache
```

```typescript
// packages/api/src/services/whatsapp-ws.service.ts
import { LRUCache } from 'lru-cache';

export class WhatsAppWebSocketService {
  // Replace Map with LRU Cache
  private processedMessages = new LRUCache<string, number>({
    max: 10000,                    // Maximum 10,000 entries
    ttl: 10 * 60 * 1000,          // 10 minute TTL
    updateAgeOnGet: false,         // Don't refresh TTL on access
    allowStale: false,             // Don't return stale entries
  });

  // Update usage - no change to API
  private isDuplicate(key: string): boolean {
    if (this.processedMessages.has(key)) {
      return true;
    }
    this.processedMessages.set(key, Date.now());
    return false;
  }

  // Add metrics method
  getCacheStats() {
    return {
      size: this.processedMessages.size,
      maxSize: 10000,
      // LRU cache doesn't track hits/misses by default
    };
  }
}
```

```typescript
// apps/web/src/hooks/use-realtime-sync.ts
import { LRUCache } from 'lru-cache';

// Replace module-level Map with LRU Cache
const processedMessageEvents = new LRUCache<string, number>({
  max: 5000,               // Smaller limit for browser
  ttl: 10 * 60 * 1000,    // 10 minutes
});

// Remove manual cleanup - LRU handles it automatically
function isMessageEventDuplicate(event: WhatsAppEvent): boolean {
  // ... same logic, but no need for cleanupMessageEventCache()
}
```

---

### PERF002: Add Database Connection Pool Configuration

| Attribute | Value |
|-----------|-------|
| **Priority** | P2 - MEDIUM |
| **Complexity** | Low |
| **Estimated Effort** | 2 hours |
| **Component** | Database |

#### Problem Statement

No explicit connection pool limits could exhaust database connections under load, causing connection timeouts.

#### Files to Modify

| File | Purpose |
|------|---------|
| `packages/db/src/index.ts` | Add pool configuration |
| `packages/env/src/server.ts` | Add pool env vars |

#### Deliverables

1. Add connection pool configuration to Prisma adapter
2. Add environment variables for pool size
3. Add connection pool metrics

#### Acceptance Criteria

- [ ] Pool size configurable via `DATABASE_POOL_MIN/MAX`
- [ ] Connection acquisition timeout configured
- [ ] Metrics for active/idle connections

#### Implementation

```typescript
// packages/env/src/server.ts
export const env = createEnv({
  server: {
    DATABASE_URL: z.string().min(1),
    DATABASE_POOL_MIN: z.coerce.number().int().min(1).default(5),
    DATABASE_POOL_MAX: z.coerce.number().int().min(1).default(20),
    DATABASE_POOL_IDLE_TIMEOUT: z.coerce.number().int().default(30000),
    // ... existing env vars
  },
  // ...
});
```

```typescript
// packages/db/src/index.ts
import { env } from '@pharmabroker/env/server';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

import { PrismaClient, Prisma } from '../prisma/generated/client';

// Create pg Pool with explicit configuration
const pool = new Pool({
  connectionString: env.DATABASE_URL,
  min: env.DATABASE_POOL_MIN,
  max: env.DATABASE_POOL_MAX,
  idleTimeoutMillis: env.DATABASE_POOL_IDLE_TIMEOUT,
  connectionTimeoutMillis: 10000, // 10 second connection timeout
});

// Log pool events for debugging
pool.on('connect', () => {
  console.log('[DB] New connection established');
});

pool.on('error', (err) => {
  console.error('[DB] Pool error:', err.message);
});

const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

// Export pool stats for health checks
export function getPoolStats() {
  return {
    totalCount: pool.totalCount,
    idleCount: pool.idleCount,
    waitingCount: pool.waitingCount,
  };
}

export default prisma;
export { Prisma };
```

---

### PERF003: Add Composite Database Indexes

| Attribute | Value |
|-----------|-------|
| **Priority** | P2 - MEDIUM |
| **Complexity** | Low |
| **Estimated Effort** | 2 hours |
| **Component** | Database |

#### Problem Statement

Common query patterns lack optimal indexes, causing slow queries as data volume grows.

#### Files to Modify

| File | Purpose |
|------|---------|
| `packages/db/prisma/schema/whatsapp.prisma` | Add indexes |

#### Deliverables

1. Add composite indexes for common query patterns
2. Create migration
3. Document query patterns covered

#### Acceptance Criteria

- [ ] Migration runs successfully
- [ ] Query explain plans show index usage
- [ ] No query takes > 100ms for 10k records

#### Implementation

```prisma
// packages/db/prisma/schema/whatsapp.prisma

model WhatsAppSession {
  // ... existing fields ...

  // Existing indexes
  @@index([userId])
  @@index([status])
  @@index([historySyncStatus])
  
  // NEW: Composite indexes for common queries
  @@index([userId, status])                    // List sessions by user and status
  @@index([userId, autoConnect])               // Find auto-connect sessions for user
  @@map("whatsapp_session")
}

model WhatsAppMessage {
  // ... existing fields ...

  // Existing indexes
  @@index([sessionId])
  @@index([groupId])
  @@index([participantId])
  @@index([senderJid])
  @@index([messageTimestamp])
  @@index([source])
  @@index([aiStatus])
  @@index([contentHash])
  @@index([sessionId, contentHash])

  // NEW: Composite indexes for common queries
  @@index([sessionId, aiStatus, messageTimestamp])  // Pending messages by session
  @@index([groupId, messageTimestamp])              // Messages in group by time
  @@index([aiStatus, aiScheduledFor])               // Scheduled AI processing
  @@index([sessionId, groupId, messageTimestamp])   // Messages by session+group
  @@map("whatsapp_message")
}

model WhatsAppGroup {
  // ... existing fields ...

  // NEW: Composite index
  @@index([sessionId, isArchived])                  // Non-archived groups by session
  @@map("whatsapp_group")
}
```

```bash
# Generate and run migration
cd packages/db
bunx prisma migrate dev --name add_composite_indexes
```

---

### PERF004: Implement Parallel Chunk Processing for AI

| Attribute | Value |
|-----------|-------|
| **Priority** | P3 - LOW |
| **Complexity** | Medium |
| **Estimated Effort** | 4 hours |
| **Component** | AI Engine |

#### Problem Statement

Long messages are chunked and processed sequentially, increasing latency for large messages.

#### Files to Modify

| File | Purpose |
|------|---------|
| `packages/ai/src/client.ts` (Lines 298-460) | Add parallelism |

#### Deliverables

1. Implement semaphore for controlled parallelism (max 3 concurrent)
2. Process chunks in parallel while respecting rate limits
3. Merge results maintaining order

#### Acceptance Criteria

- [ ] Processing time reduced by 40% for long messages
- [ ] No rate limit errors from provider
- [ ] Results identical to sequential processing

#### Implementation

```typescript
// packages/ai/src/semaphore.ts
export class Semaphore {
  private permits: number;
  private waiting: Array<() => void> = [];

  constructor(permits: number) {
    this.permits = permits;
  }

  async acquire(): Promise<void> {
    if (this.permits > 0) {
      this.permits--;
      return;
    }

    return new Promise(resolve => {
      this.waiting.push(resolve);
    });
  }

  release(): void {
    this.permits++;
    const next = this.waiting.shift();
    if (next) {
      this.permits--;
      next();
    }
  }

  async withPermit<T>(fn: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      return await fn();
    } finally {
      this.release();
    }
  }
}
```

```typescript
// packages/ai/src/client.ts - Modified processMessageInChunks
import { Semaphore } from './semaphore';

private async processMessageInChunks<T>(
  message: MessageInput,
  options: ProcessMessageOptions<T>,
  startTime: number,
  tokenBudget: number,
  promptTokens: number,
): Promise<ProcessingResult & { data: T | null; debug?: ProcessingDebugInfo }> {
  // ... existing chunking logic ...

  const debugInfo = this.buildDebugInfo(
    message.text,
    promptTokens,
    chunks.length,
    effectiveTokenBudget,
  );

  console.log(
    `[AI Client] Chunking: ${debugInfo.messageTokens} tokens, ${debugInfo.messageLines} lines → ${chunks.length} chunks`,
  );

  // Process chunks in parallel with semaphore (max 3 concurrent)
  const semaphore = new Semaphore(3);
  
  const resultPromises = chunksWithHeader.map((chunk, i) =>
    semaphore.withPermit(async () => {
      console.log(`[AI Client] Processing chunk ${i + 1}/${chunksWithHeader.length}...`);
      return this.processMessageDirect(
        {
          ...message,
          text: chunk,
          id: i === 0 ? message.id : `${message.id}-${i}`,
        },
        options,
        startTime,
        promptTokens,
      );
    })
  );

  const results = await Promise.all(resultPromises);

  // ... rest of merging logic unchanged ...
}
```

---

## Category 4: Code Quality (QUAL)

### QUAL001: Standardize Error Handling with ORPCError

| Attribute | Value |
|-----------|-------|
| **Priority** | P2 - MEDIUM |
| **Complexity** | Medium |
| **Estimated Effort** | 4 hours |
| **Component** | API Gateway |

#### Problem Statement

Inconsistent mix of `throw new Error()` and `throw new ORPCError()` throughout the API makes error handling unpredictable for clients.

#### Files to Modify

| File | Purpose |
|------|---------|
| `packages/api/src/errors/index.ts` | New error catalog |
| `packages/api/src/routers/*.ts` | Update error throws |
| `packages/api/src/services/*.ts` | Update error throws |

#### Deliverables

1. Create error code catalog with standard codes
2. Replace all `new Error()` with `ORPCError`
3. Add error middleware for consistent response format

#### Acceptance Criteria

- [ ] All API errors use `ORPCError`
- [ ] Error codes documented
- [ ] Consistent error response format across all endpoints

#### Implementation

```typescript
// packages/api/src/errors/index.ts
import { ORPCError } from '@orpc/server';

/**
 * Standard error codes for the PharmaBroker API
 */
export const ErrorCodes = {
  // Authentication & Authorization
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  INVALID_TOKEN: 'INVALID_TOKEN',
  SESSION_EXPIRED: 'SESSION_EXPIRED',

  // Resource Errors
  NOT_FOUND: 'NOT_FOUND',
  ALREADY_EXISTS: 'ALREADY_EXISTS',
  CONFLICT: 'CONFLICT',

  // Validation Errors
  INVALID_INPUT: 'INVALID_INPUT',
  INVALID_STATE: 'INVALID_STATE',
  VALIDATION_FAILED: 'VALIDATION_FAILED',

  // Business Logic Errors
  SESSION_NOT_CONNECTED: 'SESSION_NOT_CONNECTED',
  SYNC_IN_PROGRESS: 'SYNC_IN_PROGRESS',
  SYNC_NOT_ALLOWED: 'SYNC_NOT_ALLOWED',
  MESSAGE_PROCESSING_FAILED: 'MESSAGE_PROCESSING_FAILED',

  // External Service Errors
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
  AI_PROCESSING_FAILED: 'AI_PROCESSING_FAILED',
  WHATSAPP_ERROR: 'WHATSAPP_ERROR',
  
  // Rate Limiting
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',

  // Internal Errors
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];

/**
 * Create a standardized ORPCError
 */
export function createError(
  code: ErrorCode,
  message: string,
  details?: Record<string, unknown>
): ORPCError {
  return new ORPCError(code, {
    message,
    ...(details && { data: details }),
  });
}

/**
 * Helper functions for common errors
 */
export const Errors = {
  notFound: (resource: string, id?: string) =>
    createError(
      ErrorCodes.NOT_FOUND,
      id ? `${resource} with id '${id}' not found` : `${resource} not found`
    ),

  unauthorized: (message = 'Authentication required') =>
    createError(ErrorCodes.UNAUTHORIZED, message),

  forbidden: (message = 'Access denied') =>
    createError(ErrorCodes.FORBIDDEN, message),

  invalidState: (message: string) =>
    createError(ErrorCodes.INVALID_STATE, message),

  invalidInput: (message: string, field?: string) =>
    createError(ErrorCodes.INVALID_INPUT, message, field ? { field } : undefined),

  serviceUnavailable: (service: string) =>
    createError(ErrorCodes.SERVICE_UNAVAILABLE, `${service} is unavailable`),

  aiProcessingFailed: (message: string) =>
    createError(ErrorCodes.AI_PROCESSING_FAILED, message),
};
```

```typescript
// Example usage in routers
import { Errors } from '../errors';

// Before
throw new Error('Cannot change history sync setting after first connection');

// After
throw Errors.invalidState('Cannot change history sync setting after first connection');

// Before
throw new Error('Session must be connected to trigger sync');

// After
throw Errors.invalidState('Session must be connected to trigger sync');
```

---

### QUAL002: Fix Type Safety Issues

| Attribute | Value |
|-----------|-------|
| **Priority** | P2 - MEDIUM |
| **Complexity** | Medium |
| **Estimated Effort** | 4 hours |
| **Component** | API Gateway |

#### Problem Statement

Multiple `as any` casts bypass TypeScript safety, hiding potential runtime bugs.

#### Files to Modify

| File | Purpose |
|------|---------|
| `packages/api/src/services/whatsapp-ws.service.ts` (Line 106) | Fix WSContext type |
| `apps/server/src/index.ts` (Line 106) | Fix ws type |

#### Deliverables

1. Create proper type definitions for WebSocket contexts
2. Remove all `as any` casts
3. Add `// @ts-expect-error` with justification where unavoidable

#### Acceptance Criteria

- [ ] Zero `as any` casts in production code
- [ ] TypeScript strict mode passes
- [ ] All unavoidable casts documented

#### Implementation

```typescript
// packages/api/src/types/websocket.ts
import type { WSContext } from 'hono/ws';
import type { ServerWebSocket } from 'bun';

/**
 * Unified WebSocket interface that works with both Hono WSContext and Bun ServerWebSocket
 */
export interface UnifiedWebSocket {
  send(data: string | ArrayBuffer): void;
  close(code?: number, reason?: string): void;
}

/**
 * Adapter to normalize different WebSocket implementations
 */
export function toUnifiedWebSocket(ws: WSContext | ServerWebSocket<unknown>): UnifiedWebSocket {
  return {
    send: (data: string | ArrayBuffer) => {
      if ('send' in ws) {
        ws.send(data);
      }
    },
    close: (code?: number, reason?: string) => {
      if ('close' in ws) {
        ws.close(code, reason);
      }
    },
  };
}
```

```typescript
// packages/api/src/services/whatsapp-ws.service.ts
import { type UnifiedWebSocket, toUnifiedWebSocket } from '../types/websocket';

interface WebSocketClient {
  ws: UnifiedWebSocket;  // Changed from WSContext
  authenticated: boolean;
  connectedAt: Date;
}

handleOpen(ws: WSContext): void {
  this.currentClient = {
    ws: toUnifiedWebSocket(ws),  // Proper conversion instead of `as any`
    authenticated: false,
    connectedAt: new Date(),
  };
}
```

---

### QUAL003: Enable Production Logging in Tauri App

| Attribute | Value |
|-----------|-------|
| **Priority** | P3 - LOW |
| **Complexity** | Low |
| **Estimated Effort** | 2 hours |
| **Component** | Desktop App |

#### Problem Statement

Logging only enabled in debug builds, making production debugging impossible when users report issues.

#### Files to Modify

| File | Purpose |
|------|--------|
| `apps/web/src-tauri/src/lib.rs` (Lines 5-11) | Enable production logging |

#### Deliverables

1. Enable logging in production with WARN level
2. Configure log file rotation
3. Add crash reporting integration (optional)

#### Acceptance Criteria

- [ ] Logs written to file in production
- [ ] Log level configurable via environment
- [ ] Logs rotate to prevent disk exhaustion

#### Implementation

```rust
// apps/web/src-tauri/src/lib.rs
use tauri_plugin_log::{Target, TargetKind, TimezoneStrategy};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default();

    // Enable logging in both debug AND release builds
    let log_targets = [
        Target::new(TargetKind::Stdout),
        Target::new(TargetKind::LogDir { file_name: None }),
    ];

    // Different log levels for debug vs release
    let log_level = if cfg!(debug_assertions) {
        log::LevelFilter::Debug
    } else {
        log::LevelFilter::Warn
    };

    builder = builder.plugin(
        tauri_plugin_log::Builder::default()
            .targets(log_targets)
            .level(log_level)
            .timezone_strategy(TimezoneStrategy::UseLocal)
            .rotation_strategy(tauri_plugin_log::RotationStrategy::KeepAll)
            .max_file_size(5_000_000) // 5MB per file
            .build(),
    );

    builder
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

---

## Category 5: Testing (TEST)

### TEST001: Add Integration Tests for WebSocket Authentication

| Attribute | Value |
|-----------|-------|
| **Priority** | P2 - MEDIUM |
| **Complexity** | Medium |
| **Estimated Effort** | 6 hours |
| **Component** | API Gateway |

#### Problem Statement

Critical WebSocket auth flow lacks integration tests, risking regressions when security fixes are applied.

#### Files to Create

| File | Purpose |
|------|--------|
| `packages/api/src/services/__tests__/whatsapp-ws.service.integration.test.ts` | New test file |

#### Test Scenarios

1. ✅ Valid API key - connection accepted
2. ❌ Invalid API key - connection rejected with code 4001
3. ❌ Missing API key header - connection rejected
4. ✅ Reconnection after disconnect
5. ❌ Rate limiting under rapid connection attempts

#### Acceptance Criteria

- [ ] All 5 scenarios covered with passing tests
- [ ] Tests run in CI pipeline
- [ ] Mocks for external WebSocket dependencies
- [ ] Test execution time < 30 seconds

#### Implementation

```typescript
// packages/api/src/services/__tests__/whatsapp-ws.service.integration.test.ts
import { describe, test, expect, beforeAll, afterAll, mock } from 'bun:test';
import { WhatsAppWebSocketService } from '../whatsapp-ws.service';

describe('WhatsAppWebSocketService Integration', () => {
  let service: WhatsAppWebSocketService;
  const validApiKey = 'test-api-key-with-minimum-32-chars!!';

  beforeAll(() => {
    service = new WhatsAppWebSocketService({
      apiKey: validApiKey,
    });
  });

  afterAll(() => {
    service.close();
  });

  describe('Authentication', () => {
    test('should accept connection with valid API key', async () => {
      const mockWs = createMockWebSocket();
      
      service.handleOpen(mockWs);
      service.handleMessage(mockWs, JSON.stringify({
        type: 'auth',
        api_key: validApiKey,
      }));

      const response = JSON.parse(mockWs.sentMessages[0]);
      expect(response.type).toBe('auth_response');
      expect(response.success).toBe(true);
    });

    test('should reject connection with invalid API key', async () => {
      const mockWs = createMockWebSocket();
      
      service.handleOpen(mockWs);
      service.handleMessage(mockWs, JSON.stringify({
        type: 'auth',
        api_key: 'wrong-key',
      }));

      const response = JSON.parse(mockWs.sentMessages[0]);
      expect(response.type).toBe('auth_response');
      expect(response.success).toBe(false);
      expect(mockWs.closedWith.code).toBe(4001);
    });

    test('should reject connection when API key not configured', async () => {
      const unconfiguredService = new WhatsAppWebSocketService({
        apiKey: '', // Empty = not configured
      });
      const mockWs = createMockWebSocket();
      
      unconfiguredService.handleOpen(mockWs);
      unconfiguredService.handleMessage(mockWs, JSON.stringify({
        type: 'auth',
        api_key: 'any-key',
      }));

      expect(mockWs.closedWith.code).toBe(4001);
      expect(mockWs.closedWith.reason).toContain('configuration');
    });

    test('should allow reconnection after disconnect', async () => {
      const mockWs1 = createMockWebSocket();
      const mockWs2 = createMockWebSocket();
      
      // First connection
      service.handleOpen(mockWs1);
      service.handleMessage(mockWs1, JSON.stringify({
        type: 'auth',
        api_key: validApiKey,
      }));
      
      // Disconnect
      service.handleClose(mockWs1);
      
      // Reconnect
      service.handleOpen(mockWs2);
      service.handleMessage(mockWs2, JSON.stringify({
        type: 'auth',
        api_key: validApiKey,
      }));

      const response = JSON.parse(mockWs2.sentMessages[0]);
      expect(response.success).toBe(true);
    });
  });
});

// Helper to create mock WebSocket
function createMockWebSocket() {
  return {
    sentMessages: [] as string[],
    closedWith: null as { code?: number; reason?: string } | null,
    send(data: string) {
      this.sentMessages.push(data);
    },
    close(code?: number, reason?: string) {
      this.closedWith = { code, reason };
    },
  };
}
```

---

### TEST002: Add Load Testing Configuration

| Attribute | Value |
|-----------|-------|
| **Priority** | P2 - MEDIUM |
| **Complexity** | Medium |
| **Estimated Effort** | 4 hours |
| **Component** | All Services |

#### Problem Statement

No load testing infrastructure to validate performance under stress before deployments.

#### Files to Create

| File | Purpose |
|------|--------|
| `tests/load/k6-config.js` | k6 configuration |
| `tests/load/scenarios/api-stress.js` | API stress test |
| `tests/load/scenarios/websocket-load.js` | WebSocket load test |
| `Taskfile.yml` | Add load test task |

#### Deliverables

1. k6 configuration with baseline scenarios
2. API endpoint stress tests (100 VUs, 5 minutes)
3. WebSocket connection stress test
4. CI integration for performance regression detection

#### Acceptance Criteria

- [ ] Baseline metrics established and documented
- [ ] P95 latency < 500ms under load
- [ ] No errors at 100 concurrent users
- [ ] Automated performance reports in CI

#### Implementation

```javascript
// tests/load/scenarios/api-stress.js
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

export const errorRate = new Rate('errors');
export const apiLatency = new Trend('api_latency');

export const options = {
  stages: [
    { duration: '1m', target: 20 },   // Ramp up to 20 VUs
    { duration: '3m', target: 100 },  // Ramp up to 100 VUs
    { duration: '2m', target: 100 },  // Stay at 100 VUs
    { duration: '1m', target: 0 },    // Ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<500'],  // 95% of requests under 500ms
    errors: ['rate<0.01'],              // Error rate under 1%
  },
};

const BASE_URL = __ENV.API_URL || 'http://localhost:3000';

export default function () {
  // Health check endpoint
  const healthRes = http.get(`${BASE_URL}/health`);
  check(healthRes, {
    'health status is 200': (r) => r.status === 200,
  });

  // Sessions list (authenticated)
  const sessionRes = http.get(`${BASE_URL}/api/whatsapp/sessions`, {
    headers: {
      Authorization: `Bearer ${__ENV.AUTH_TOKEN}`,
    },
  });
  
  const success = check(sessionRes, {
    'sessions status is 200': (r) => r.status === 200,
    'sessions response time OK': (r) => r.timings.duration < 500,
  });

  errorRate.add(!success);
  apiLatency.add(sessionRes.timings.duration);

  sleep(1);
}

export function handleSummary(data) {
  return {
    'stdout': textSummary(data, { indent: ' ', enableColors: true }),
    'tests/load/results/api-stress.json': JSON.stringify(data),
  };
}
```

```javascript
// tests/load/scenarios/websocket-load.js
import ws from 'k6/ws';
import { check } from 'k6';
import { Rate } from 'k6/metrics';

export const connectionErrors = new Rate('ws_connection_errors');

export const options = {
  stages: [
    { duration: '30s', target: 50 },   // Ramp to 50 connections
    { duration: '2m', target: 50 },    // Hold
    { duration: '30s', target: 0 },    // Ramp down
  ],
  thresholds: {
    ws_connection_errors: ['rate<0.05'],  // Under 5% connection errors
  },
};

const WS_URL = __ENV.WS_URL || 'ws://localhost:3000/ws';

export default function () {
  const res = ws.connect(WS_URL, {}, function (socket) {
    socket.on('open', () => {
      // Send auth message
      socket.send(JSON.stringify({
        type: 'auth',
        api_key: __ENV.WS_API_KEY,
      }));
    });

    socket.on('message', (data) => {
      const msg = JSON.parse(data);
      check(msg, {
        'auth successful': (m) => m.type === 'auth_response' && m.success,
      });
    });

    socket.on('error', (e) => {
      connectionErrors.add(1);
    });

    // Keep connection open for 30 seconds
    socket.setTimeout(() => {
      socket.close();
    }, 30000);
  });

  check(res, {
    'WebSocket connected': (r) => r && r.status === 101,
  });
}
```

```yaml
# Taskfile.yml addition
load-test:
  desc: Run load tests with k6
  cmds:
    - k6 run tests/load/scenarios/api-stress.js

load-test-ws:
  desc: Run WebSocket load tests
  cmds:
    - k6 run tests/load/scenarios/websocket-load.js
```

---

## Category 6: Compliance (COMP)

### COMP001: Implement Data Retention Policy

| Attribute | Value |
|-----------|-------|
| **Priority** | P1 - HIGH |
| **Complexity** | Medium |
| **Estimated Effort** | 6 hours |
| **Component** | Database + API Gateway |

#### Problem Statement

Healthcare data must have defined retention periods for compliance. Currently messages are stored indefinitely with no automatic cleanup.

#### Files to Modify/Create

| File | Purpose |
|------|--------|
| `packages/db/prisma/schema/whatsapp.prisma` | Add retention fields |
| `packages/api/src/services/retention.service.ts` | New retention service |
| `packages/api/src/jobs/retention-cleanup.ts` | Scheduled cleanup job |

#### Deliverables

1. Add `retainUntil` field to WhatsAppMessage
2. Create retention service with configurable periods
3. Implement daily cleanup job
4. Add audit logging for deletions

#### Acceptance Criteria

- [ ] Default 90-day retention (configurable per tenant)
- [ ] Cleanup runs daily at configurable time
- [ ] Audit log entry for each deleted batch
- [ ] Legal hold option to prevent deletion

#### Implementation

```prisma
// packages/db/prisma/schema/whatsapp.prisma

model WhatsAppMessage {
  // ... existing fields ...
  
  // Retention fields
  retainUntil   DateTime?  @map("retain_until")
  legalHold     Boolean    @default(false) @map("legal_hold")
  
  @@index([retainUntil])
  @@map("whatsapp_message")
}
```

```typescript
// packages/api/src/services/retention.service.ts
import prisma from '@pharmabroker/db';
import { logger } from '@pharmabroker/logger';
import { auditService } from './audit.service';

export interface RetentionConfig {
  defaultRetentionDays: number;
  cleanupBatchSize: number;
  dryRun?: boolean;
}

class RetentionService {
  private log = logger.child('retention');
  private config: RetentionConfig;

  constructor(config?: Partial<RetentionConfig>) {
    this.config = {
      defaultRetentionDays: config?.defaultRetentionDays ?? 90,
      cleanupBatchSize: config?.cleanupBatchSize ?? 1000,
      dryRun: config?.dryRun ?? false,
    };
  }

  /**
   * Set retention date for new messages
   */
  calculateRetainUntil(): Date {
    const date = new Date();
    date.setDate(date.getDate() + this.config.defaultRetentionDays);
    return date;
  }

  /**
   * Run cleanup for expired messages
   */
  async cleanup(): Promise<{ deleted: number; skipped: number }> {
    const now = new Date();
    let totalDeleted = 0;
    let totalSkipped = 0;

    this.log.info('Starting retention cleanup', {
      cutoffDate: now.toISOString(),
      batchSize: this.config.cleanupBatchSize,
      dryRun: this.config.dryRun,
    });

    // Process in batches to avoid long transactions
    while (true) {
      // Find expired messages not on legal hold
      const expiredMessages = await prisma.whatsAppMessage.findMany({
        where: {
          retainUntil: { lt: now },
          legalHold: false,
        },
        select: { id: true, sessionId: true },
        take: this.config.cleanupBatchSize,
      });

      if (expiredMessages.length === 0) {
        break;
      }

      if (this.config.dryRun) {
        this.log.info('Dry run - would delete messages', {
          count: expiredMessages.length,
        });
        totalSkipped += expiredMessages.length;
        break;
      }

      // Delete batch
      const result = await prisma.whatsAppMessage.deleteMany({
        where: {
          id: { in: expiredMessages.map(m => m.id) },
        },
      });

      totalDeleted += result.count;

      // Audit log
      const sessionIds = [...new Set(expiredMessages.map(m => m.sessionId))];
      for (const sessionId of sessionIds) {
        const count = expiredMessages.filter(m => m.sessionId === sessionId).length;
        await auditService.log({
          userId: 'system',
          action: 'message.delete',
          resource: 'WhatsAppMessage',
          metadata: {
            reason: 'retention_policy',
            sessionId,
            count,
          },
        });
      }

      this.log.info('Deleted message batch', { count: result.count, totalDeleted });
    }

    this.log.info('Retention cleanup complete', { totalDeleted, totalSkipped });

    return { deleted: totalDeleted, skipped: totalSkipped };
  }

  /**
   * Set legal hold on messages
   */
  async setLegalHold(messageIds: string[], hold: boolean): Promise<number> {
    const result = await prisma.whatsAppMessage.updateMany({
      where: { id: { in: messageIds } },
      data: { legalHold: hold },
    });

    this.log.info('Legal hold updated', {
      messageCount: result.count,
      hold,
    });

    return result.count;
  }

  /**
   * Get retention statistics
   */
  async getStats() {
    const [total, expiring30d, legalHold] = await Promise.all([
      prisma.whatsAppMessage.count(),
      prisma.whatsAppMessage.count({
        where: {
          retainUntil: {
            lt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          },
        },
      }),
      prisma.whatsAppMessage.count({
        where: { legalHold: true },
      }),
    ]);

    return { total, expiring30d, legalHold };
  }
}

export const retentionService = new RetentionService();
```

---

### COMP002: Add Soft Delete Pattern

| Attribute | Value |
|-----------|-------|
| **Priority** | P2 - MEDIUM |
| **Complexity** | Medium |
| **Estimated Effort** | 4 hours |
| **Component** | Database + API Gateway |

#### Problem Statement

CASCADE delete permanently removes data. Accidental deletions are unrecoverable, which is risky for healthcare data.

#### Files to Modify

| File | Purpose |
|------|--------|
| `packages/db/prisma/schema/whatsapp.prisma` | Add soft delete fields |
| `packages/db/src/index.ts` | Add Prisma middleware |
| `packages/api/src/services/*.ts` | Update delete operations |

#### Deliverables

1. Add `deletedAt` field to WhatsAppSession, WhatsAppGroup, WhatsAppMessage
2. Add global Prisma middleware to filter deleted records
3. Update delete operations to set `deletedAt` instead of removing
4. Add restore functionality for admins

#### Acceptance Criteria

- [ ] Delete operations set `deletedAt` instead of removing rows
- [ ] All queries exclude soft-deleted records by default
- [ ] Admin can restore deleted records within 30 days
- [ ] Hard delete runs automatically after 30 days

#### Implementation

```prisma
// packages/db/prisma/schema/whatsapp.prisma

model WhatsAppSession {
  // ... existing fields ...
  
  deletedAt   DateTime?  @map("deleted_at")
  
  @@index([deletedAt])
  @@map("whatsapp_session")
}

model WhatsAppGroup {
  // ... existing fields ...
  
  deletedAt   DateTime?  @map("deleted_at")
  
  @@index([deletedAt])
  @@map("whatsapp_group")
}

model WhatsAppMessage {
  // ... existing fields ...
  
  deletedAt   DateTime?  @map("deleted_at")
  
  @@index([deletedAt])
  @@map("whatsapp_message")
}
```

```typescript
// packages/db/src/middleware/soft-delete.ts
import { Prisma } from '../../prisma/generated/client';

const SOFT_DELETE_MODELS = ['WhatsAppSession', 'WhatsAppGroup', 'WhatsAppMessage'];

/**
 * Prisma middleware for soft delete pattern
 */
export const softDeleteMiddleware: Prisma.Middleware = async (params, next) => {
  const model = params.model as string;
  
  if (!SOFT_DELETE_MODELS.includes(model)) {
    return next(params);
  }

  // Intercept delete operations
  if (params.action === 'delete') {
    params.action = 'update';
    params.args.data = { deletedAt: new Date() };
  }

  if (params.action === 'deleteMany') {
    params.action = 'updateMany';
    if (params.args.data !== undefined) {
      params.args.data.deletedAt = new Date();
    } else {
      params.args.data = { deletedAt: new Date() };
    }
  }

  // Filter out soft-deleted records on queries
  if (params.action === 'findUnique' || params.action === 'findFirst') {
    params.action = 'findFirst';
    params.args.where = {
      ...params.args.where,
      deletedAt: null,
    };
  }

  if (params.action === 'findMany') {
    if (!params.args) {
      params.args = {};
    }
    if (!params.args.where) {
      params.args.where = {};
    }
    // Only add filter if not explicitly querying deleted records
    if (params.args.where.deletedAt === undefined) {
      params.args.where.deletedAt = null;
    }
  }

  return next(params);
};
```

```typescript
// packages/db/src/index.ts
import { softDeleteMiddleware } from './middleware/soft-delete';

// ... existing code ...

prisma.$use(softDeleteMiddleware);

export default prisma;
```

```typescript
// packages/api/src/services/soft-delete.service.ts
import prisma, { Prisma } from '@pharmabroker/db';
import { logger } from '@pharmabroker/logger';

class SoftDeleteService {
  private log = logger.child('soft-delete');

  /**
   * Restore a soft-deleted session
   */
  async restoreSession(sessionId: string): Promise<boolean> {
    const result = await prisma.$executeRaw`
      UPDATE whatsapp_session 
      SET deleted_at = NULL 
      WHERE id = ${sessionId} AND deleted_at IS NOT NULL
    `;
    return result > 0;
  }

  /**
   * Permanently delete records older than specified days
   */
  async hardDeleteOldRecords(olderThanDays: number = 30): Promise<{
    sessions: number;
    groups: number;
    messages: number;
  }> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - olderThanDays);

    const sessions = await prisma.$executeRaw`
      DELETE FROM whatsapp_session WHERE deleted_at < ${cutoff}
    `;

    const groups = await prisma.$executeRaw`
      DELETE FROM whatsapp_group WHERE deleted_at < ${cutoff}
    `;

    const messages = await prisma.$executeRaw`
      DELETE FROM whatsapp_message WHERE deleted_at < ${cutoff}
    `;

    this.log.info('Hard delete completed', {
      cutoff: cutoff.toISOString(),
      deleted: { sessions, groups, messages },
    });

    return {
      sessions: Number(sessions),
      groups: Number(groups),
      messages: Number(messages),
    };
  }

  /**
   * List soft-deleted records (for admin view)
   */
  async listDeletedSessions(userId: string) {
    return prisma.$queryRaw<Array<{ id: string; deletedAt: Date }>>`
      SELECT id, deleted_at as "deletedAt" 
      FROM whatsapp_session 
      WHERE user_id = ${userId} AND deleted_at IS NOT NULL
      ORDER BY deleted_at DESC
    `;
  }
}

export const softDeleteService = new SoftDeleteService();
```

---

### DEPS001: Add Automated Security Audit Pipeline

| Attribute | Value |
|-----------|-------|
| **Priority** | P2 - MEDIUM |
| **Complexity** | Low |
| **Estimated Effort** | 3 hours |
| **Component** | CI/CD |

#### Problem Statement

No automated scanning for vulnerable dependencies in npm or Go modules, leaving the system exposed to known CVEs.

#### Files to Create/Modify

| File | Purpose |
|------|--------|
| `.github/workflows/security-audit.yml` | New GitHub Actions workflow |
| `Taskfile.yml` | Add audit tasks |

#### Deliverables

1. Add `bun audit` to CI pipeline
2. Add `govulncheck` for Go dependencies  
3. Fail CI on high/critical vulnerabilities
4. Weekly scheduled full audit with notifications

#### Acceptance Criteria

- [ ] CI fails on high/critical CVEs
- [ ] Weekly audit report generated
- [ ] Slack/email notification for new vulnerabilities
- [ ] Badge in README showing audit status

#### Implementation

```yaml
# .github/workflows/security-audit.yml
name: Security Audit

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]
  schedule:
    - cron: '0 6 * * 1'  # Weekly on Monday at 6 AM UTC
  workflow_dispatch:

jobs:
  npm-audit:
    name: NPM Dependency Audit
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Bun
        uses: oven-sh/setup-bun@v1
        with:
          bun-version: latest

      - name: Install dependencies
        run: bun install --frozen-lockfile

      - name: Run security audit
        run: |
          # Run audit and capture output
          bun audit --json > audit-results.json 2>&1 || true
          
          # Check for high/critical vulnerabilities
          HIGH_COUNT=$(jq '[.advisories[] | select(.severity == "high" or .severity == "critical")] | length' audit-results.json)
          
          if [ "$HIGH_COUNT" -gt 0 ]; then
            echo "::error::Found $HIGH_COUNT high/critical vulnerabilities"
            jq '.advisories[] | select(.severity == "high" or .severity == "critical")' audit-results.json
            exit 1
          fi
          
          echo "No high/critical vulnerabilities found"

      - name: Upload audit results
        uses: actions/upload-artifact@v4
        if: always()
        with:
          name: npm-audit-results
          path: audit-results.json

  go-audit:
    name: Go Vulnerability Check
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: service/whatsapp
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Go
        uses: actions/setup-go@v5
        with:
          go-version: '1.24'

      - name: Install govulncheck
        run: go install golang.org/x/vuln/cmd/govulncheck@latest

      - name: Run vulnerability check
        run: |
          govulncheck -json ./... > vuln-results.json 2>&1 || true
          
          # Check if any vulnerabilities were found
          if grep -q '"OSV":' vuln-results.json; then
            echo "::error::Go vulnerabilities found"
            cat vuln-results.json
            exit 1
          fi
          
          echo "No Go vulnerabilities found"

      - name: Upload vulnerability results
        uses: actions/upload-artifact@v4
        if: always()
        with:
          name: go-vuln-results
          path: service/whatsapp/vuln-results.json

  notify:
    name: Notify on Failure
    runs-on: ubuntu-latest
    needs: [npm-audit, go-audit]
    if: failure() && github.event_name == 'schedule'
    steps:
      - name: Send notification
        uses: slackapi/slack-github-action@v1
        with:
          payload: |
            {
              "text": "⚠️ Security Audit Failed",
              "blocks": [
                {
                  "type": "section",
                  "text": {
                    "type": "mrkdwn",
                    "text": "Security vulnerabilities detected in PharmaBroker dependencies. <${{ github.server_url }}/${{ github.repository }}/actions/runs/${{ github.run_id }}|View Details>"
                  }
                }
              ]
            }
        env:
          SLACK_WEBHOOK_URL: ${{ secrets.SLACK_WEBHOOK_URL }}
```

```yaml
# Taskfile.yml additions
audit:
  desc: Run all security audits locally
  cmds:
    - task: audit:npm
    - task: audit:go

audit:npm:
  desc: Run npm security audit
  cmds:
    - bun audit

audit:go:
  desc: Run Go vulnerability check
  dir: service/whatsapp
  cmds:
    - go install golang.org/x/vuln/cmd/govulncheck@latest
    - govulncheck ./...
```

---

## Implementation Schedule

### Sprint 1 (Week 1): Critical Security

| Task | Effort | Dependencies | Owner |
|------|--------|--------------|-------|
| SEC001 - WebSocket Auth Gap | 2h | None | |
| SEC002 - Remove Default API Key | 1h | None | |
| SEC003 - Fix CORS Wildcard | 1h | None | |
| SEC004 - API Rate Limiting | 4h | None | |
| **Sprint Total** | **8h** | | |

### Sprint 2 (Week 2): Reliability & Data Protection

| Task | Effort | Dependencies | Owner |
|------|--------|--------------|-------|
| REL001 - Message Queue Persistence | 12h | None | |
| REL002 - Circuit Breaker | 6h | None | |
| COMP001 - Data Retention Policy | 6h | None | |
| **Sprint Total** | **24h** | | |

### Sprint 3 (Week 3): Performance & Quality

| Task | Effort | Dependencies | Owner |
|------|--------|--------------|-------|
| PERF001 - LRU Cache | 2h | None | |
| PERF002 - DB Connection Pool | 2h | None | |
| PERF003 - Composite Indexes | 2h | None | |
| QUAL001 - Error Standardization | 4h | None | |
| QUAL002 - Type Safety | 4h | None | |
| REL003 - Graceful Shutdown | 4h | None | |
| **Sprint Total** | **18h** | | |

### Sprint 4 (Week 4): Testing & Compliance

| Task | Effort | Dependencies | Owner |
|------|--------|--------------|-------|
| TEST001 - WebSocket Integration Tests | 6h | SEC001 | |
| TEST002 - Load Testing | 4h | None | |
| DEPS001 - Security Audit Pipeline | 3h | None | |
| COMP002 - Soft Delete | 4h | None | |
| SEC005 - Request Signing | 8h | None | |
| **Sprint Total** | **25h** | | |

### Backlog (As Capacity Allows)

| Task | Effort | Dependencies | Owner |
|------|--------|--------------|-------|
| SEC006 - Audit Logging | 6h | None | |
| REL004 - Health Aggregation | 3h | None | |
| PERF004 - Parallel AI Processing | 4h | REL002 | |
| QUAL003 - Production Logging | 2h | None | |
| **Backlog Total** | **15h** | | |

---

## Quick Reference

### By Priority

**P0 - CRITICAL (Fix Immediately)**
- SEC001: WebSocket Authentication Gap
- SEC002: Remove Default API Key  
- SEC003: Fix CORS Wildcard Default

**P1 - HIGH (Within 1 Week)**
- SEC004: API Rate Limiting
- SEC005: Request Signing
- REL001: Message Queue Persistence
- REL002: Circuit Breaker
- COMP001: Data Retention Policy

**P2 - MEDIUM (Within 2 Weeks)**
- SEC006: Audit Logging
- REL003: Graceful Shutdown
- REL004: Health Aggregation
- PERF001-003: Performance Improvements
- QUAL001-002: Code Quality
- TEST001-002: Testing
- DEPS001: Security Audit Pipeline
- COMP002: Soft Delete

**P3 - LOW (When Available)**
- PERF004: Parallel AI Processing
- QUAL003: Production Logging

### By Component

**Desktop App (Tauri/React)**
- PERF001: LRU Cache (frontend)
- QUAL003: Production Logging

**API Gateway (Bun/Hono)**
- SEC001, SEC002, SEC004, SEC005, SEC006
- REL001, REL002, REL003, REL004
- PERF001 (backend), PERF002
- QUAL001, QUAL002
- TEST001, TEST002
- COMP001, COMP002

**WhatsApp Service (Go)**
- SEC003, SEC005

**Database (PostgreSQL)**
- PERF002, PERF003
- COMP001, COMP002

**CI/CD**
- DEPS001

---

## Appendix: File Index

| File Path | Tasks |
|-----------|-------|
| `packages/api/src/services/whatsapp-ws.service.ts` | SEC001, PERF001, QUAL002 |
| `packages/env/src/server.ts` | SEC002, PERF002 |
| `apps/server/src/index.ts` | SEC004, REL003, REL004, QUAL002 |
| `service/whatsapp/internal/infrastructure/config/config.go` | SEC003 |
| `packages/api/src/services/whatsapp.service.ts` | SEC005 |
| `service/whatsapp/internal/presentation/http/middleware.go` | SEC005 |
| `packages/db/prisma/schema/whatsapp.prisma` | REL001, PERF003, COMP001, COMP002 |
| `packages/db/prisma/schema/auth.prisma` | SEC006 |
| `packages/ai/src/client.ts` | REL002, PERF004 |
| `packages/db/src/index.ts` | PERF002, COMP002 |
| `apps/web/src/hooks/use-realtime-sync.ts` | PERF001 |
| `apps/web/src-tauri/src/lib.rs` | QUAL003 |
| `packages/api/src/routers/*.ts` | QUAL001, SEC006 |
| `.github/workflows/security-audit.yml` | DEPS001 |
| `Taskfile.yml` | TEST002, DEPS001 |