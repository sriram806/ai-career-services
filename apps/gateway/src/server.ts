import { createLogger } from '@ai-career-os/logger';

import { loadGatewayConfig } from './config/gateway-config';
import { buildApp } from './app';

const SERVICE_NAME = 'gateway';

/**
 * Application entry point with graceful shutdown support.
 */
async function main(): Promise<void> {
  // Load and validate configuration
  const config = loadGatewayConfig();

  // Create structured logger
  const logger = createLogger(SERVICE_NAME, { level: config.LOG_LEVEL });

  // Build the Fastify application
  const app = await buildApp(logger);

  // ─── Graceful Shutdown ────────────────────────────
  const signals: NodeJS.Signals[] = ['SIGINT', 'SIGTERM'];

  for (const signal of signals) {
    process.on(signal, () => {
      logger.info({ signal }, 'Received shutdown signal');
      void app.close().then(() => {
        logger.info('Server closed gracefully');
        process.exit(0);
      });
    });
  }

  // Handle uncaught exceptions
  process.on('uncaughtException', (error) => {
    logger.fatal({ err: error }, 'Uncaught exception');
    process.exit(1);
  });

  process.on('unhandledRejection', (reason) => {
    logger.fatal({ err: reason }, 'Unhandled rejection');
    process.exit(1);
  });

  // ─── Start Server ─────────────────────────────────
  try {
    const port = config.PORT;
    await app.listen({ port, host: '0.0.0.0' });
    logger.info({ port, environment: config.NODE_ENV }, `${SERVICE_NAME} started`);
  } catch (err) {
    logger.fatal({ err }, 'Failed to start server');
    process.exit(1);
  }
}

void main();
