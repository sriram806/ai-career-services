import Redis from 'ioredis';

import type { Logger } from 'pino';

/**
 * Redis connection manager using ioredis.
 * Provides connection lifecycle, health checks, and graceful shutdown.
 */
export class RedisConnection {
  private client: Redis | null = null;
  private readonly logger: Logger;

  constructor(
    private readonly config: {
      host: string;
      port: number;
      password?: string;
      db?: number;
      maxRetriesPerRequest?: number;
    },
    logger: Logger,
  ) {
    this.logger = logger.child({ component: 'RedisConnection' });
  }

  /**
   * Establish Redis connection.
   */
  async connect(): Promise<Redis> {
    if (this.client) {
      return this.client;
    }

    this.client = new Redis({
      host: this.config.host,
      port: this.config.port,
      password: this.config.password,
      db: this.config.db ?? 0,
      maxRetriesPerRequest: this.config.maxRetriesPerRequest ?? 3,
      retryStrategy(times: number) {
        const delay = Math.min(times * 200, 5000);
        return delay;
      },
      lazyConnect: false,
      enableReadyCheck: true,
    });

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

  /**
   * Get the Redis client instance.
   */
  getClient(): Redis {
    if (!this.client) {
      throw new Error('Redis not connected. Call connect() first.');
    }
    return this.client;
  }

  /**
   * Health check — PING/PONG.
   */
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

  /**
   * Gracefully close the connection.
   */
  async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.quit();
      this.client = null;
      this.logger.info('Redis disconnected');
    }
  }
}
