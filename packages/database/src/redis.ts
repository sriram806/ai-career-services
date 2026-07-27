import Redis from 'ioredis';

import type { Logger } from 'pino';

export class RedisConnection {
  private client: Redis | null = null;
  private readonly logger: Logger;

  constructor(
    private readonly config: {
      url?: string;
      host?: string;
      port?: number;
      password?: string;
      db?: number;
      maxRetriesPerRequest?: number | null;
    },
    logger: Logger,
  ) {
    this.logger = logger.child({ component: 'RedisConnection' });
  }

  async connect(): Promise<Redis> {
    if (this.client) {
      return this.client;
    }

    const options = {
      db: this.config.db ?? 0,
      maxRetriesPerRequest: this.config.maxRetriesPerRequest !== undefined ? this.config.maxRetriesPerRequest : 3,
      retryStrategy(times: number) {
        const delay = Math.min(times * 200, 5000);
        return delay;
      },
      lazyConnect: false,
      enableReadyCheck: true,
    };

    if (this.config.url) {
      this.client = new Redis(this.config.url, options);
    } else {
      this.client = new Redis({
        host: this.config.host || 'localhost',
        port: this.config.port || 6379,
        password: this.config.password,
        ...options,
      });
    }

    this.client.on('connect', () => {
      this.logger.info('Redis connected successfully');
    });

    this.client.on('error', (err) => {
      this.logger.error({ err }, 'Redis connection error');
    });

    this.client.on('close', () => {
      this.logger.warn('Redis connection closed');
    });

    // Wait for ready
    await new Promise<void>((resolve, reject) => {
      this.client?.once('ready', resolve);
      this.client?.once('error', reject);
    });

    return this.client;
  }

  getClient(): Redis {
    if (!this.client) {
      throw new Error('Redis not connected. Call connect() first.');
    }
    return this.client;
  }

  async healthCheck(): Promise<boolean> {
    try {
      if (!this.client) {
        return false;
      }
      const result = await this.client.ping();
      return result === 'PONG';
    } catch {
      return false;
    }
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.quit();
      this.client = null;
      this.logger.info('Redis disconnected');
    }
  }
}
