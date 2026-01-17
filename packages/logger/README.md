# @pharmabroker/logger

Centralized logging package using Winston with structured logging support.

## Features

- **Structured Logging**: JSON format in production, human-readable in development
- **Multiple Log Levels**: error, warn, info, http, verbose, debug, silly
- **Service-Specific Loggers**: Create child loggers for different services
- **File Logging**: Automatic file rotation in production
- **Colorized Output**: Easy-to-read console output in development

## Installation

```bash
bun add @pharmabroker/logger
```

## Usage

### Basic Usage

```typescript
import { logger } from '@pharmabroker/logger';

logger.info('Application started');
logger.error('Something went wrong', { error: err.message });
logger.warn('Deprecated API used', { endpoint: '/old-api' });
```

### Service-Specific Logger

```typescript
import { logger } from '@pharmabroker/logger';

const serviceLogger = logger.child('MyService');

serviceLogger.info('Processing request', { requestId: '123' });
serviceLogger.error('Request failed', { requestId: '123', error: 'Timeout' });
```

### Structured Logging

```typescript
logger.info('User logged in', {
  userId: '123',
  email: 'user@example.com',
  timestamp: new Date().toISOString(),
});
```

## Log Levels

- **error**: Error messages (logged to error.log in production)
- **warn**: Warning messages
- **info**: Informational messages (default level)
- **http**: HTTP request logs
- **verbose**: Verbose information
- **debug**: Debug information
- **silly**: Very detailed debug information

## Configuration

Set the log level using the `LOG_LEVEL` environment variable:

```bash
LOG_LEVEL=debug npm start
```

## Output Formats

### Development

```
2026-01-17 15:34:19 info [MyService] User logged in {
  "userId": "123",
  "email": "user@example.com"
}
```

### Production (JSON)

```json
{
  "level": "info",
  "message": "User logged in",
  "service": "MyService",
  "userId": "123",
  "email": "user@example.com",
  "timestamp": "2026-01-17T15:34:19.123Z"
}
```

## File Logging (Production Only)

In production, logs are automatically written to:

- `logs/error.log` - Error logs only
- `logs/combined.log` - All logs

Files are automatically rotated when they reach 5MB, keeping the last 5 files.
