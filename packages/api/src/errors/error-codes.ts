/**
 * Standardized error codes for the API
 */
export const ErrorCodes = {
  // Authentication & Authorization
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',

  // Resource Not Found
  SESSION_NOT_FOUND: 'SESSION_NOT_FOUND',
  MESSAGE_NOT_FOUND: 'MESSAGE_NOT_FOUND',
  GROUP_NOT_FOUND: 'GROUP_NOT_FOUND',
  SYNC_NOT_FOUND: 'SYNC_NOT_FOUND',

  // Invalid State/Status
  INVALID_STATUS: 'INVALID_STATUS',
  SESSION_NOT_CONNECTED: 'SESSION_NOT_CONNECTED',

  // Service Errors
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
  SYNC_FAILED: 'SYNC_FAILED',
  INTERNAL_ERROR: 'INTERNAL_ERROR',

  // Validation Errors
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  INVALID_INPUT: 'INVALID_INPUT',
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];
