/**
 * Logger Package
 *
 * Centralized logging using Winston with structured logging support.
 * Provides consistent logging across all services.
 */

import winston from 'winston';

// ============================================================================
// Types
// ============================================================================

export interface LogMetadata {
  [key: string]: unknown;
}

export type LogLevel =
  | 'error'
  | 'warn'
  | 'info'
  | 'http'
  | 'verbose'
  | 'debug'
  | 'silly';

// ============================================================================
// Logger Configuration
// ============================================================================

const logLevel = process.env.LOG_LEVEL || 'info';
const nodeEnv = process.env.NODE_ENV || 'development';

// Custom format for development
const devFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.printf(({ timestamp, level, message, service, ...meta }) => {
    const metaStr = Object.keys(meta).length
      ? JSON.stringify(meta, null, 2)
      : '';
    const serviceStr = service ? `[${service}]` : '';
    return `${timestamp} ${level} ${serviceStr} ${message} ${metaStr}`;
  }),
);

// JSON format for production
const prodFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format.json(),
);

// ============================================================================
// Winston Logger Instance
// ============================================================================

const winstonLogger = winston.createLogger({
  level: logLevel,
  format: nodeEnv === 'production' ? prodFormat : devFormat,
  defaultMeta: { service: 'pharmabroker' },
  transports: [
    // Console transport
    new winston.transports.Console({
      stderrLevels: ['error'],
    }),
  ],
});

// Add file transports in production
if (nodeEnv === 'production') {
  winstonLogger.add(
    new winston.transports.File({
      filename: 'logs/error.log',
      level: 'error',
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),
  );
  winstonLogger.add(
    new winston.transports.File({
      filename: 'logs/combined.log',
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),
  );
}

// ============================================================================
// Logger Class
// ============================================================================

class Logger {
  private service: string;

  constructor(service: string = 'pharmabroker') {
    this.service = service;
  }

  /**
   * Create a child logger with a specific service name
   */
  child(service: string): Logger {
    return new Logger(service);
  }

  /**
   * Log error message
   */
  error(message: string, meta?: LogMetadata): void {
    winstonLogger.error(message, { service: this.service, ...meta });
  }

  /**
   * Log warning message
   */
  warn(message: string, meta?: LogMetadata): void {
    winstonLogger.warn(message, { service: this.service, ...meta });
  }

  /**
   * Log info message
   */
  info(message: string, meta?: LogMetadata): void {
    winstonLogger.info(message, { service: this.service, ...meta });
  }

  /**
   * Log HTTP request
   */
  http(message: string, meta?: LogMetadata): void {
    winstonLogger.http(message, { service: this.service, ...meta });
  }

  /**
   * Log verbose message
   */
  verbose(message: string, meta?: LogMetadata): void {
    winstonLogger.verbose(message, { service: this.service, ...meta });
  }

  /**
   * Log debug message
   */
  debug(message: string, meta?: LogMetadata): void {
    winstonLogger.debug(message, { service: this.service, ...meta });
  }

  /**
   * Log silly message
   */
  silly(message: string, meta?: LogMetadata): void {
    winstonLogger.silly(message, { service: this.service, ...meta });
  }
}

// ============================================================================
// Default Logger Instance
// ============================================================================

export const logger = new Logger();

// ============================================================================
// Exports
// ============================================================================

export { Logger };
export default logger;
