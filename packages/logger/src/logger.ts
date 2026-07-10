import pino from 'pino';

import type { Logger, LoggerOptions } from 'pino';

/**
 * Create a structured Pino logger instance.
 *
 * - JSON output in production (machine-parseable for log aggregation)
 * - Pretty output in development (human-readable)
 * - Includes service name, version, and environment in every log line
 * - Supports correlation ID injection via child loggers
 *
 * @param serviceName - Name of the microservice
 * @param options - Additional Pino options
 * @returns Configured Pino logger
 */
export function createLogger(
  serviceName: string,
  options?: {
    level?: string;
    version?: string;
  },
): Logger {
  const isProduction = process.env['NODE_ENV'] === 'production';
  const level = options?.level ?? process.env['LOG_LEVEL'] ?? (isProduction ? 'info' : 'debug');

  const loggerOptions: LoggerOptions = {
    name: serviceName,
    level,
    timestamp: pino.stdTimeFunctions.isoTime,
    formatters: {
      level(label: string) {
        return { level: label };
      },
      bindings(bindings) {
        return {
          service: bindings['name'],
          pid: bindings['pid'],
          hostname: bindings['hostname'],
          version: options?.version ?? '0.1.0',
          environment: process.env['NODE_ENV'] ?? 'development',
        };
      },
    },
    // Redact sensitive fields from logs
    redact: {
      paths: [
        'req.headers.authorization',
        'req.headers.cookie',
        'req.headers["x-api-key"]',
        'body.password',
        'body.token',
        'body.refreshToken',
        'body.creditCard',
      ],
      censor: '[REDACTED]',
    },
    serializers: {
      err: pino.stdSerializers.err,
      req: pino.stdSerializers.req,
      res: pino.stdSerializers.res,
    },
  };

  // Use pino-pretty in development for human-readable logs
  if (!isProduction) {
    loggerOptions.transport = {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'SYS:standard',
        ignore: 'pid,hostname',
        singleLine: false,
      },
    };
  }

  return pino(loggerOptions);
}
