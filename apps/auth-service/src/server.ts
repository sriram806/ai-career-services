import dns from 'node:dns';

import { loadConfig } from '@ai-career-os/config';
import { createLogger } from '@ai-career-os/logger';

import { buildApp } from './app';

const SERVICE_NAME = 'auth-service';

async function main(): Promise<void> {
  // Enterprise Egress DNS Fix: Force Node.js getaddrinfo to prefer IPv4 over IPv6.
  // Render containers lack public IPv6 routing, which causes ENETUNREACH when connecting to Gmail SMTP.
  if (typeof dns.setDefaultResultOrder === 'function') {
    dns.setDefaultResultOrder('ipv4first');
  }

  const config = loadConfig();
  const logger = createLogger(SERVICE_NAME, {
    level: config.LOG_LEVEL,
  });

  const app = await buildApp(logger);

  const signals: NodeJS.Signals[] = ['SIGINT', 'SIGTERM'];
  for (const signal of signals) {
    process.on(signal, () => {
      logger.info({ signal }, 'Received shutdown signal');
      void app.close().then(() => {
        logger.info('Server closed');
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

  // Start Server
  try {
    const port = config.AUTH_SERVICE_PORT;
    await app.listen({ port, host: '0.0.0.0' });
    logger.info({ port, environment: config.NODE_ENV }, `${SERVICE_NAME} started`);
  } catch (err) {
    logger.fatal({ err }, 'Failed to start server');
    process.exit(1);
  }
}

void main();
