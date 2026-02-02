import type { Context } from '../context';
import { ApiError } from './api-error';
import { ErrorCodes } from './error-codes';

/**
 * Helper functions for common error scenarios
 */

export function notFoundError(
  resource: string,
  context?: Context,
  details?: Record<string, unknown>,
) {
  const code = `${resource.toUpperCase()}_NOT_FOUND` as keyof typeof ErrorCodes;
  return new ApiError(
    ErrorCodes[code] || ErrorCodes.INTERNAL_ERROR,
    `${resource} not found`,
    {
      requestId: context?.requestId,
      details,
    },
  );
}

export function invalidStatusError(
  message: string,
  context?: Context,
  details?: Record<string, unknown>,
) {
  return new ApiError(ErrorCodes.INVALID_STATUS, message, {
    requestId: context?.requestId,
    details,
  });
}

export function serviceUnavailableError(
  message: string,
  context?: Context,
  details?: Record<string, unknown>,
) {
  return new ApiError(ErrorCodes.SERVICE_UNAVAILABLE, message, {
    requestId: context?.requestId,
    details,
  });
}

export function syncFailedError(
  message: string,
  context?: Context,
  details?: Record<string, unknown>,
  cause?: unknown,
) {
  return new ApiError(ErrorCodes.SYNC_FAILED, message, {
    requestId: context?.requestId,
    details,
    cause,
  });
}

export function sessionNotConnectedError(
  message: string = 'Session must be connected',
  context?: Context,
  details?: Record<string, unknown>,
) {
  return new ApiError(ErrorCodes.SESSION_NOT_CONNECTED, message, {
    requestId: context?.requestId,
    details,
  });
}
