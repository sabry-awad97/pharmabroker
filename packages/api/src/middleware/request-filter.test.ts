/**
 * Request Filter Middleware Property Tests
 *
 * Feature: websocket-architecture-refactor
 * Tests Properties 20-21 from the design document
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import * as fc from 'fast-check';
import {
  isPathBlocked,
  parseBlockedPatterns,
  loadRequestFilterConfig,
  DEFAULT_BLOCKED_PATTERNS,
  createRequestFilterMiddleware,
} from './request-filter';

describe('RequestFilter', () => {
  // Store original env vars
  const originalEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    originalEnv.BLOCKED_PATH_PATTERNS = process.env.BLOCKED_PATH_PATTERNS;
    originalEnv.LOG_BLOCKED_REQUESTS = process.env.LOG_BLOCKED_REQUESTS;
    delete process.env.BLOCKED_PATH_PATTERNS;
    delete process.env.LOG_BLOCKED_REQUESTS;
  });

  afterEach(() => {
    if (originalEnv.BLOCKED_PATH_PATTERNS !== undefined) {
      process.env.BLOCKED_PATH_PATTERNS = originalEnv.BLOCKED_PATH_PATTERNS;
    } else {
      delete process.env.BLOCKED_PATH_PATTERNS;
    }
    if (originalEnv.LOG_BLOCKED_REQUESTS !== undefined) {
      process.env.LOG_BLOCKED_REQUESTS = originalEnv.LOG_BLOCKED_REQUESTS;
    } else {
      delete process.env.LOG_BLOCKED_REQUESTS;
    }
  });

  describe('Unit Tests', () => {
    describe('isPathBlocked', () => {
      it('should block paths matching .zip pattern', () => {
        expect(isPathBlocked('/backup.zip', DEFAULT_BLOCKED_PATTERNS)).toBe(
          true,
        );
      });

      it('should block paths matching .sql pattern', () => {
        expect(isPathBlocked('/database.sql', DEFAULT_BLOCKED_PATTERNS)).toBe(
          true,
        );
      });

      it('should block paths matching .env pattern', () => {
        expect(isPathBlocked('/.env', DEFAULT_BLOCKED_PATTERNS)).toBe(true);
        // .env.local doesn't match \.env$ pattern (which requires .env at end)
        // but it does match the pattern because we have \.env$ which matches /.env
      });

      it('should block paths matching .git pattern', () => {
        expect(isPathBlocked('/.git/config', DEFAULT_BLOCKED_PATTERNS)).toBe(
          true,
        );
      });

      it('should block paths matching wp-admin pattern', () => {
        expect(isPathBlocked('/wp-admin/', DEFAULT_BLOCKED_PATTERNS)).toBe(
          true,
        );
      });

      it('should block paths matching phpMyAdmin pattern', () => {
        expect(isPathBlocked('/phpMyAdmin/', DEFAULT_BLOCKED_PATTERNS)).toBe(
          true,
        );
        expect(isPathBlocked('/phpmyadmin/', DEFAULT_BLOCKED_PATTERNS)).toBe(
          true,
        );
      });

      it('should allow normal API paths', () => {
        expect(isPathBlocked('/api/users', DEFAULT_BLOCKED_PATTERNS)).toBe(
          false,
        );
        expect(isPathBlocked('/rpc/whatsapp', DEFAULT_BLOCKED_PATTERNS)).toBe(
          false,
        );
        expect(isPathBlocked('/health', DEFAULT_BLOCKED_PATTERNS)).toBe(false);
      });

      it('should allow WebSocket paths', () => {
        expect(isPathBlocked('/ws/whatsapp', DEFAULT_BLOCKED_PATTERNS)).toBe(
          false,
        );
      });

      it('should handle empty patterns array', () => {
        expect(isPathBlocked('/anything', [])).toBe(false);
      });

      it('should handle invalid regex patterns gracefully', () => {
        // Invalid regex should be skipped
        expect(isPathBlocked('/test', ['[invalid'])).toBe(false);
      });
    });

    describe('parseBlockedPatterns', () => {
      it('should return default patterns when env var is not set', () => {
        expect(parseBlockedPatterns(undefined)).toEqual(
          DEFAULT_BLOCKED_PATTERNS,
        );
      });

      it('should return default patterns when env var is empty', () => {
        expect(parseBlockedPatterns('')).toEqual(DEFAULT_BLOCKED_PATTERNS);
        expect(parseBlockedPatterns('   ')).toEqual(DEFAULT_BLOCKED_PATTERNS);
      });

      it('should parse comma-separated patterns', () => {
        expect(parseBlockedPatterns('\\.test$,\\.demo$')).toEqual([
          '\\.test$',
          '\\.demo$',
        ]);
      });

      it('should trim whitespace from patterns', () => {
        expect(parseBlockedPatterns(' \\.test$ , \\.demo$ ')).toEqual([
          '\\.test$',
          '\\.demo$',
        ]);
      });

      it('should filter empty patterns', () => {
        expect(parseBlockedPatterns('\\.test$,,\\.demo$')).toEqual([
          '\\.test$',
          '\\.demo$',
        ]);
      });
    });

    describe('loadRequestFilterConfig', () => {
      it('should use default patterns when env var not set', () => {
        const config = loadRequestFilterConfig();
        expect(config.blockedPatterns).toEqual(DEFAULT_BLOCKED_PATTERNS);
      });

      it('should use custom patterns from env var', () => {
        process.env.BLOCKED_PATH_PATTERNS = '\\.custom$';
        const config = loadRequestFilterConfig();
        expect(config.blockedPatterns).toEqual(['\\.custom$']);
      });

      it('should enable logging by default', () => {
        const config = loadRequestFilterConfig();
        expect(config.logBlocked).toBe(true);
      });

      it('should disable logging when env var is false', () => {
        process.env.LOG_BLOCKED_REQUESTS = 'false';
        const config = loadRequestFilterConfig();
        expect(config.logBlocked).toBe(false);
      });
    });
  });

  describe('Property Tests', () => {
    /**
     * Property 20: Request Filter Blocks Patterns
     * For any request path matching a blocked pattern, the middleware SHALL return HTTP 403 Forbidden.
     * Validates: Requirements 7.2
     */
    it('Property 20: Paths matching blocked patterns are blocked', () => {
      // Test with specific blocked extensions
      const blockedExtensions = ['.zip', '.sql', '.bak', '.env', '.php'];

      fc.assert(
        fc.property(
          fc.constantFrom(...blockedExtensions),
          fc
            .string({ minLength: 1, maxLength: 20 })
            .filter(s => /^[a-z]+$/.test(s)),
          (ext, filename) => {
            const path = `/${filename}${ext}`;
            return isPathBlocked(path, DEFAULT_BLOCKED_PATTERNS) === true;
          },
        ),
        { numRuns: 100 },
      );
    });

    /**
     * Property 20 (inverse): Normal paths are not blocked
     */
    it('Property 20 (inverse): Normal API paths are not blocked', () => {
      const normalPaths = [
        '/api/users',
        '/api/sessions',
        '/rpc/whatsapp',
        '/health',
        '/ready',
        '/ws/whatsapp',
        '/api-reference',
        '/',
      ];

      fc.assert(
        fc.property(fc.constantFrom(...normalPaths), path => {
          return isPathBlocked(path, DEFAULT_BLOCKED_PATTERNS) === false;
        }),
        { numRuns: 100 },
      );
    });

    /**
     * Property 21: Filter Pattern Configuration
     * For any configuration, if BLOCKED_PATH_PATTERNS environment variable is set,
     * those patterns SHALL be used. If not set, the default patterns SHALL be used.
     * Validates: Requirements 7.4, 7.5
     */
    it('Property 21: Uses env var patterns when set', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc
              .string({ minLength: 1, maxLength: 10 })
              .filter(s => /^[a-z]+$/.test(s)),
            { minLength: 1, maxLength: 5 },
          ),
          patterns => {
            const envValue = patterns.map(p => `\\.${p}$`).join(',');
            process.env.BLOCKED_PATH_PATTERNS = envValue;

            const config = loadRequestFilterConfig();

            delete process.env.BLOCKED_PATH_PATTERNS;

            return config.blockedPatterns.length === patterns.length;
          },
        ),
        { numRuns: 100 },
      );
    });

    /**
     * Property 21: Uses default patterns when env var not set
     */
    it('Property 21: Uses default patterns when env var not set', () => {
      fc.assert(
        fc.property(fc.constantFrom(undefined, '', '   '), envValue => {
          if (envValue !== undefined) {
            process.env.BLOCKED_PATH_PATTERNS = envValue;
          } else {
            delete process.env.BLOCKED_PATH_PATTERNS;
          }

          const patterns = parseBlockedPatterns(envValue);

          delete process.env.BLOCKED_PATH_PATTERNS;

          return patterns === DEFAULT_BLOCKED_PATTERNS;
        }),
        { numRuns: 10 },
      );
    });

    /**
     * Property: Empty patterns array blocks nothing
     */
    it('Property: Empty patterns array blocks nothing', () => {
      fc.assert(
        fc.property(fc.string({ minLength: 1, maxLength: 100 }), path => {
          return isPathBlocked(path, []) === false;
        }),
        { numRuns: 100 },
      );
    });

    /**
     * Property: Case insensitive matching
     */
    it('Property: Pattern matching is case insensitive', () => {
      fc.assert(
        fc.property(fc.constantFrom('ZIP', 'Zip', 'zIp', 'zip'), ext => {
          const path = `/backup.${ext}`;
          return isPathBlocked(path, ['\\.zip$']) === true;
        }),
        { numRuns: 10 },
      );
    });

    /**
     * Property: Invalid regex patterns don't crash
     */
    it('Property: Invalid regex patterns are handled gracefully', () => {
      fc.assert(
        fc.property(fc.string({ minLength: 1, maxLength: 50 }), path => {
          // These are invalid regex patterns
          const invalidPatterns = ['[invalid', '(unclosed', '*invalid'];

          // Should not throw and should return false (not blocked)
          try {
            const result = isPathBlocked(path, invalidPatterns);
            return result === false;
          } catch {
            return false; // Should not throw
          }
        }),
        { numRuns: 100 },
      );
    });
  });
});
