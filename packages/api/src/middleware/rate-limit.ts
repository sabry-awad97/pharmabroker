/**
 * Rate Limiting Middleware
 *
 * Implements token bucket algorithm for rate limiting API requests.
 * Prevents DoS attacks and ensures fair resource usage.
 */

import type { Context, Next } from 'hono';

// ============================================================================
// Types
// ============================================================================

interface RateLimitConfig {
  /** Maximum requests per window */
  maxRequests: number;
  /** Time window in milliseconds */
  windowMs: number;
  /** Message to return when rate limit exceeded */
  message?: string;
  /** Skip rate limiting for certain paths */
  skip?: (c: Context) => boolean;
}

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

// ============================================================================
// Rate Limiter
// ============================================================================

export class RateLimiter {
  private store: Map<string, RateLimitEntry> = new Map();
  private config: Required<RateLimitConfig>;
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;

  constructor(config: RateLimitConfig) {
    this.config = {
      maxRequests: config.maxRequests,
      windowMs: config.windowMs,
      message: config.message ?? 'Too many requests, please try again later',
      skip: config.skip ?? (() => false),
    };

    // Start cleanup interval to prevent memory leaks
    this.startCleanup();
  }

  /**
   * Check if request should be rate limited
   */
  check(key: string): { allowed: boolean; remaining: number; resetAt: number } {
    const now = Date.now();
    let entry = this.store.get(key);

    // Create new entry if doesn't exist or expired
    if (!entry || now >= entry.resetAt) {
      entry = {
        count: 0,
        resetAt: now + this.config.windowMs,
      };
      this.store.set(key, entry);
    }

    // Increment count
    entry.count++;

    const allowed = entry.count <= this.config.maxRequests;
    const remaining = Math.max(0, this.config.maxRequests - entry.count);

    return { allowed, remaining, resetAt: entry.resetAt };
  }

  /**
   * Reset rate limit for a key
   */
  reset(key: string): void {
    this.store.delete(key);
  }

  /**
   * Get current stats for a key
   */
  getStats(key: string): { count: number; remaining: number } | null {
    const entry = this.store.get(key);
    if (!entry) return null;

    const remaining = Math.max(0, this.config.maxRequests - entry.count);
    return { count: entry.count, remaining };
  }

  /**
   * Start periodic cleanup of expired entries
   */
  private startCleanup(): void {
    if (this.cleanupInterval) return;

    this.cleanupInterval = setInterval(() => {
      const now = Date.now();
      const toDelete: string[] = [];

      for (const [key, entry] of this.store.entries()) {
        if (now >= entry.resetAt) {
          toDelete.push(key);
        }
      }

      for (const key of toDelete) {
        this.store.delete(key);
      }

      if (toDelete.length > 0) {
        console.log(
          `[RateLimit] Cleaned up ${toDelete.length} expired entries`,
        );
      }
    }, 60000); // Cleanup every minute
  }

  /**
   * Stop cleanup interval
   */
  stop(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }

  /**
   * Get total number of tracked keys
   */
  size(): number {
    return this.store.size;
  }
}

// ============================================================================
// Middleware Factory
// ============================================================================

/**
 * Create rate limiting middleware
 *
 * @example
 * ```typescript
 * // Limit to 100 requests per minute per IP
 * app.use(rateLimit({
 *   maxRequests: 100,
 *   windowMs: 60000,
 * }));
 *
 * // Limit to 10 requests per minute per user
 * app.use(rateLimit({
 *   maxRequests: 10,
 *   windowMs: 60000,
 *   keyGenerator: (c) => c.get('session')?.user?.id ?? 'anonymous',
 * }));
 * ```
 */
export function rateLimit(
  config: RateLimitConfig & {
    /** Function to generate rate limit key (default: IP address) */
    keyGenerator?: (c: Context) => string;
  },
) {
  const limiter = new RateLimiter(config);
  const keyGenerator =
    config.keyGenerator ?? ((c: Context) => getClientIp(c) ?? 'unknown');

  return async (c: Context, next: Next) => {
    // Skip if configured
    if (config.skip?.(c)) {
      return next();
    }

    const key = keyGenerator(c);
    const { allowed, remaining, resetAt } = limiter.check(key);

    // Set rate limit headers
    c.header('X-RateLimit-Limit', config.maxRequests.toString());
    c.header('X-RateLimit-Remaining', remaining.toString());
    c.header('X-RateLimit-Reset', Math.ceil(resetAt / 1000).toString());

    if (!allowed) {
      c.header(
        'Retry-After',
        Math.ceil((resetAt - Date.now()) / 1000).toString(),
      );
      return c.json(
        {
          error: 'RATE_LIMIT_EXCEEDED',
          message: config.message,
          retryAfter: Math.ceil((resetAt - Date.now()) / 1000),
        },
        429,
      );
    }

    return next();
  };
}

// ============================================================================
// Preset Configurations
// ============================================================================

/**
 * Strict rate limit for authentication endpoints
 * Increased to accommodate frequent session checks from SPA
 */
export const authRateLimit = rateLimit({
  maxRequests: 100, // Increased from 5
  windowMs: 60 * 1000, // Changed to 1 minute (from 15 minutes)
  message: 'Too many authentication attempts, please try again later',
  skip: c => {
    // Skip rate limiting for session checks (read-only)
    const path = c.req.path;
    return path.includes('/get-session');
  },
});

/**
 * Standard rate limit for API endpoints
 */
export const apiRateLimit = rateLimit({
  maxRequests: 100,
  windowMs: 60 * 1000, // 1 minute
});

/**
 * Relaxed rate limit for read-only endpoints
 */
export const readRateLimit = rateLimit({
  maxRequests: 300,
  windowMs: 60 * 1000, // 1 minute
});

/**
 * Strict rate limit for write operations
 */
export const writeRateLimit = rateLimit({
  maxRequests: 30,
  windowMs: 60 * 1000, // 1 minute
});

// ============================================================================
// Utilities
// ============================================================================

/**
 * Extract client IP from request
 */
function getClientIp(c: Context): string | null {
  // Check proxy headers
  const forwarded = c.req.header('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0]?.trim() ?? null;
  }

  const realIp = c.req.header('x-real-ip');
  if (realIp) {
    return realIp;
  }

  return null;
}
