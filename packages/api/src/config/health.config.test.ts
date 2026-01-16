/**
 * Health Configuration Property Tests
 *
 * Feature: websocket-architecture-refactor
 * Tests Property 19 from the design document
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import * as fc from 'fast-check';
import {
  loadHealthConfig,
  HEALTH_CONFIG_DEFAULTS,
  type HealthConfig,
} from './health.config';

describe('HealthConfig', () => {
  // Store original env vars to restore after tests
  const originalEnv: Record<string, string | undefined> = {};
  const envVarNames = [
    'WS_PING_INTERVAL_MS',
    'WS_PONG_TIMEOUT_MS',
    'WS_RECONNECT_DELAY_MS',
    'WS_MAX_RECONNECT_DELAY_MS',
    'CB_FAILURE_THRESHOLD',
    'CB_RESET_TIMEOUT_MS',
    'SYNC_MAX_RETRIES',
    'SYNC_RETRY_DELAY_MS',
  ];

  beforeEach(() => {
    // Save original values
    for (const name of envVarNames) {
      originalEnv[name] = process.env[name];
      delete process.env[name];
    }
  });

  afterEach(() => {
    // Restore original values
    for (const name of envVarNames) {
      if (originalEnv[name] !== undefined) {
        process.env[name] = originalEnv[name];
      } else {
        delete process.env[name];
      }
    }
  });

  describe('Unit Tests', () => {
    it('should return default values when no env vars are set', () => {
      const config = loadHealthConfig();

      expect(config.WS_PING_INTERVAL_MS).toBe(
        HEALTH_CONFIG_DEFAULTS.WS_PING_INTERVAL_MS,
      );
      expect(config.WS_PONG_TIMEOUT_MS).toBe(
        HEALTH_CONFIG_DEFAULTS.WS_PONG_TIMEOUT_MS,
      );
      expect(config.WS_RECONNECT_DELAY_MS).toBe(
        HEALTH_CONFIG_DEFAULTS.WS_RECONNECT_DELAY_MS,
      );
      expect(config.WS_MAX_RECONNECT_DELAY_MS).toBe(
        HEALTH_CONFIG_DEFAULTS.WS_MAX_RECONNECT_DELAY_MS,
      );
      expect(config.CB_FAILURE_THRESHOLD).toBe(
        HEALTH_CONFIG_DEFAULTS.CB_FAILURE_THRESHOLD,
      );
      expect(config.CB_RESET_TIMEOUT_MS).toBe(
        HEALTH_CONFIG_DEFAULTS.CB_RESET_TIMEOUT_MS,
      );
      expect(config.SYNC_MAX_RETRIES).toBe(
        HEALTH_CONFIG_DEFAULTS.SYNC_MAX_RETRIES,
      );
      expect(config.SYNC_RETRY_DELAY_MS).toBe(
        HEALTH_CONFIG_DEFAULTS.SYNC_RETRY_DELAY_MS,
      );
    });

    it('should use env var value when set', () => {
      process.env.WS_PING_INTERVAL_MS = '60000';
      process.env.CB_FAILURE_THRESHOLD = '10';

      const config = loadHealthConfig();

      expect(config.WS_PING_INTERVAL_MS).toBe(60000);
      expect(config.CB_FAILURE_THRESHOLD).toBe(10);
    });

    it('should use default for invalid env var values', () => {
      process.env.WS_PING_INTERVAL_MS = 'invalid';
      process.env.CB_FAILURE_THRESHOLD = '-5';

      const config = loadHealthConfig();

      expect(config.WS_PING_INTERVAL_MS).toBe(
        HEALTH_CONFIG_DEFAULTS.WS_PING_INTERVAL_MS,
      );
      expect(config.CB_FAILURE_THRESHOLD).toBe(
        HEALTH_CONFIG_DEFAULTS.CB_FAILURE_THRESHOLD,
      );
    });

    it('should handle empty string env vars', () => {
      process.env.WS_PING_INTERVAL_MS = '';

      const config = loadHealthConfig();

      expect(config.WS_PING_INTERVAL_MS).toBe(
        HEALTH_CONFIG_DEFAULTS.WS_PING_INTERVAL_MS,
      );
    });

    it('should handle zero as valid value', () => {
      process.env.SYNC_MAX_RETRIES = '0';

      const config = loadHealthConfig();

      expect(config.SYNC_MAX_RETRIES).toBe(0);
    });
  });

  describe('Property Tests', () => {
    /**
     * Property 19: Config Loading with Defaults
     * For any configuration value, if the corresponding environment variable is not set,
     * the default value SHALL be used. If the environment variable is set, its value SHALL be used.
     * Validates: Requirements 6.1, 6.5
     */
    it('Property 19: Uses default when env var not set', () => {
      fc.assert(
        fc.property(fc.constantFrom(...envVarNames), (envVarName: string) => {
          // Ensure env var is not set
          delete process.env[envVarName];

          const config = loadHealthConfig();
          const defaultValue =
            HEALTH_CONFIG_DEFAULTS[
              envVarName as keyof typeof HEALTH_CONFIG_DEFAULTS
            ];

          return config[envVarName as keyof HealthConfig] === defaultValue;
        }),
        { numRuns: 100 },
      );
    });

    /**
     * Property 19: Uses env var value when set
     */
    it('Property 19: Uses env var value when set to valid positive integer', () => {
      fc.assert(
        fc.property(
          fc.constantFrom(...envVarNames),
          fc.integer({ min: 0, max: 1_000_000 }),
          (envVarName: string, value: number) => {
            process.env[envVarName] = String(value);

            const config = loadHealthConfig();

            // Clean up
            delete process.env[envVarName];

            return config[envVarName as keyof HealthConfig] === value;
          },
        ),
        { numRuns: 100 },
      );
    });

    /**
     * Property: Invalid values fall back to defaults
     */
    it('Property: Invalid string values fall back to defaults', () => {
      fc.assert(
        fc.property(
          fc.constantFrom(...envVarNames),
          fc.string().filter(s => isNaN(parseInt(s, 10)) || s === ''),
          (envVarName: string, invalidValue: string) => {
            process.env[envVarName] = invalidValue;

            const config = loadHealthConfig();
            const defaultValue =
              HEALTH_CONFIG_DEFAULTS[
                envVarName as keyof typeof HEALTH_CONFIG_DEFAULTS
              ];

            // Clean up
            delete process.env[envVarName];

            return config[envVarName as keyof HealthConfig] === defaultValue;
          },
        ),
        { numRuns: 100 },
      );
    });

    /**
     * Property: Negative values fall back to defaults
     */
    it('Property: Negative values fall back to defaults', () => {
      fc.assert(
        fc.property(
          fc.constantFrom(...envVarNames),
          fc.integer({ min: -1_000_000, max: -1 }),
          (envVarName: string, negativeValue: number) => {
            process.env[envVarName] = String(negativeValue);

            const config = loadHealthConfig();
            const defaultValue =
              HEALTH_CONFIG_DEFAULTS[
                envVarName as keyof typeof HEALTH_CONFIG_DEFAULTS
              ];

            // Clean up
            delete process.env[envVarName];

            return config[envVarName as keyof HealthConfig] === defaultValue;
          },
        ),
        { numRuns: 100 },
      );
    });

    /**
     * Property: All config values are non-negative
     */
    it('Property: All config values are non-negative', () => {
      fc.assert(
        fc.property(
          fc.record({
            WS_PING_INTERVAL_MS: fc.option(fc.string(), { nil: undefined }),
            WS_PONG_TIMEOUT_MS: fc.option(fc.string(), { nil: undefined }),
            WS_RECONNECT_DELAY_MS: fc.option(fc.string(), { nil: undefined }),
            WS_MAX_RECONNECT_DELAY_MS: fc.option(fc.string(), {
              nil: undefined,
            }),
            CB_FAILURE_THRESHOLD: fc.option(fc.string(), { nil: undefined }),
            CB_RESET_TIMEOUT_MS: fc.option(fc.string(), { nil: undefined }),
            SYNC_MAX_RETRIES: fc.option(fc.string(), { nil: undefined }),
            SYNC_RETRY_DELAY_MS: fc.option(fc.string(), { nil: undefined }),
          }),
          envVars => {
            // Set env vars
            for (const [key, value] of Object.entries(envVars)) {
              if (value !== undefined) {
                process.env[key] = value;
              } else {
                delete process.env[key];
              }
            }

            const config = loadHealthConfig();

            // Clean up
            for (const key of Object.keys(envVars)) {
              delete process.env[key];
            }

            // All values should be non-negative
            return Object.values(config).every(v => v >= 0);
          },
        ),
        { numRuns: 100 },
      );
    });

    /**
     * Property: Config always returns all required fields
     */
    it('Property: Config always returns all required fields', () => {
      fc.assert(
        fc.property(
          fc.record({
            WS_PING_INTERVAL_MS: fc.option(fc.string(), { nil: undefined }),
            WS_PONG_TIMEOUT_MS: fc.option(fc.string(), { nil: undefined }),
            WS_RECONNECT_DELAY_MS: fc.option(fc.string(), { nil: undefined }),
            WS_MAX_RECONNECT_DELAY_MS: fc.option(fc.string(), {
              nil: undefined,
            }),
            CB_FAILURE_THRESHOLD: fc.option(fc.string(), { nil: undefined }),
            CB_RESET_TIMEOUT_MS: fc.option(fc.string(), { nil: undefined }),
            SYNC_MAX_RETRIES: fc.option(fc.string(), { nil: undefined }),
            SYNC_RETRY_DELAY_MS: fc.option(fc.string(), { nil: undefined }),
          }),
          envVars => {
            // Set env vars
            for (const [key, value] of Object.entries(envVars)) {
              if (value !== undefined) {
                process.env[key] = value;
              } else {
                delete process.env[key];
              }
            }

            const config = loadHealthConfig();

            // Clean up
            for (const key of Object.keys(envVars)) {
              delete process.env[key];
            }

            // All required fields should be present
            return (
              'WS_PING_INTERVAL_MS' in config &&
              'WS_PONG_TIMEOUT_MS' in config &&
              'WS_RECONNECT_DELAY_MS' in config &&
              'WS_MAX_RECONNECT_DELAY_MS' in config &&
              'CB_FAILURE_THRESHOLD' in config &&
              'CB_RESET_TIMEOUT_MS' in config &&
              'SYNC_MAX_RETRIES' in config &&
              'SYNC_RETRY_DELAY_MS' in config
            );
          },
        ),
        { numRuns: 100 },
      );
    });
  });
});
