import { ORPCError } from '@orpc/server';
import type { ErrorCode } from './error-codes';

interface ErrorData {
  message: string;
  details?: Record<string, unknown>;
  timestamp: string;
  requestId?: string;
}

/**
 * Standardized API error with consistent structure
 *
 * Usage:
 * ```ts
 * throw new ApiError(
 *   ErrorCodes.MESSAGE_NOT_FOUND,
 *   'Message not found',
 *   { requestId: context.requestId, details: { messageId: '123' } }
 * );
 * ```
 */
export class ApiError<TCode extends ErrorCode = ErrorCode> extends ORPCError<
  TCode,
  ErrorData
> {
  constructor(
    code: TCode,
    message: string,
    options?: {
      details?: Record<string, unknown>;
      requestId?: string;
      cause?: unknown;
    },
  ) {
    const timestamp = new Date().toISOString();

    // Pass data wrapped in options object to ORPCError
    super(code, {
      data: {
        message,
        details: options?.details,
        timestamp,
        requestId: options?.requestId,
      },
    });

    // Maintain proper stack trace
    if (options?.cause instanceof Error) {
      this.cause = options.cause;
    }
  }

  /**
   * Get timestamp from error data
   */
  get timestamp(): string {
    return this.data.timestamp;
  }

  /**
   * Get details from error data
   */
  get details(): Record<string, unknown> | undefined {
    return this.data.details;
  }

  /**
   * Get requestId from error data
   */
  get requestId(): string | undefined {
    return this.data.requestId;
  }

  /**
   * Get message from error data
   */
  get message(): string {
    return this.data.message;
  }
}
