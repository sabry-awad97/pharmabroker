/**
 * Request Filter Middleware
 *
 * Blocks suspicious requests from scanners and bots by matching
 * request paths against known malicious patterns.
 *
 * Feature: websocket-architecture-refactor
 * Requirements: 7.1, 7.2, 7.3, 7.4, 7.5
 */

import type { Context, Next } from 'hono';

/**
 * Default blocked patterns for common scanner targets
 */
export const DEFAULT_BLOCKED_PATTERNS = [
  '\\.zip$',
  '\\.sql$',
  '\\.bak$',
  '\\.env$',
  '\\.git',
  '\\.svn',
  '\\.htaccess',
  '\\.htpasswd',
  'wp-admin',
  'wp-login',
  'wp-content',
  'phpMyAdmin',
  'phpmyadmin',
  '\\.php$',
  '\\.asp$',
  '\\.aspx$',
  '\\.jsp$',
  '\\.cgi$',
  'admin\\.php',
  'config\\.php',
  'setup\\.php',
  'install\\.php',
  'xmlrpc\\.php',
  '\\.aws',
  '\\.docker',
  'docker-compose',
  '\\.kube',
  'credentials',
  '\\.ssh',
  'id_rsa',
  '\\.pem$',
  '\\.key$',
  'passwd$',
  'shadow$',
  '\\.log$',
  '\\.old$',
  '\\.orig$',
  '\\.swp$',
  '~$',
];

export interface RequestFilterConfig {
  /** Regex patterns to block (default: DEFAULT_BLOCKED_PATTERNS) */
  blockedPatterns: string[];
  /** Whether to log blocked requests (default: true) */
  logBlocked: boolean;
}

/**
 * Parse blocked patterns from environment variable
 * Format: comma-separated list of regex patterns
 */
export function parseBlockedPatterns(envValue: string | undefined): string[] {
  if (!envValue || envValue.trim() === '') {
    return DEFAULT_BLOCKED_PATTERNS;
  }

  return envValue
    .split(',')
    .map(p => p.trim())
    .filter(p => p.length > 0);
}

/**
 * Load request filter configuration from environment
 */
export function loadRequestFilterConfig(): RequestFilterConfig {
  return {
    blockedPatterns: parseBlockedPatterns(process.env.BLOCKED_PATH_PATTERNS),
    logBlocked: process.env.LOG_BLOCKED_REQUESTS !== 'false',
  };
}

/**
 * Check if a path matches any blocked pattern
 */
export function isPathBlocked(path: string, patterns: string[]): boolean {
  for (const pattern of patterns) {
    try {
      const regex = new RegExp(pattern, 'i');
      if (regex.test(path)) {
        return true;
      }
    } catch {
      // Invalid regex pattern, skip it
      console.warn(`[RequestFilter] Invalid regex pattern: ${pattern}`);
    }
  }
  return false;
}

/**
 * Get client IP from request headers
 */
function getClientIp(c: Context): string {
  // Check common proxy headers
  const forwarded = c.req.header('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }

  const realIp = c.req.header('x-real-ip');
  if (realIp) {
    return realIp;
  }

  // Fallback to connection info (may not be available in all environments)
  return 'unknown';
}

/**
 * Create request filter middleware
 *
 * Blocks requests matching suspicious patterns and returns 403 Forbidden.
 * Logs blocked requests with client IP and path.
 */
export function createRequestFilterMiddleware(
  config?: Partial<RequestFilterConfig>,
): (c: Context, next: Next) => Promise<Response | void> {
  const finalConfig: RequestFilterConfig = {
    ...loadRequestFilterConfig(),
    ...config,
  };

  return async (c: Context, next: Next): Promise<Response | void> => {
    const path = c.req.path;

    if (isPathBlocked(path, finalConfig.blockedPatterns)) {
      if (finalConfig.logBlocked) {
        const clientIp = getClientIp(c);
        console.log(`[RequestFilter] Blocked request: ${clientIp} -> ${path}`);
      }

      return c.text('Forbidden', 403);
    }

    await next();
  };
}

/**
 * Default request filter middleware instance
 */
export const requestFilterMiddleware = createRequestFilterMiddleware();
