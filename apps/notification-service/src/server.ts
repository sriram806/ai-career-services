import { loadConfig } from '@ai-career-os/config';
import { createLogger } from '@ai-career-os/logger';

import { buildApp } from './app';

const SERVICE_NAME = 'notification-service';

async function main(): Promise<void> {
  const config = loadConfig();
  const logger = createLogger(SERVICE_NAME, { level: config.LOG_LEVEL });
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
    const port = 3008;
    await app.listen({ port, host: '0.0.0.0' });
    logger.info({ port, environment: config.NODE_ENV }, `${SERVICE_NAME} started`);
  } catch (err) {
    logger.fatal({ err }, 'Failed to start server');
    process.exit(1);
  }
}

void main();
