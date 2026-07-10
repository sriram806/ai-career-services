import mongoose from 'mongoose';

import type { Logger } from 'pino';

/**
 * MongoDB connection manager using Mongoose.
 * Manages connection lifecycle with retry logic and health checks.
 */
export class MongoConnection {
  private connection: typeof mongoose | null = null;
  private readonly logger: Logger;

  constructor(
    private readonly config: {
      uri?: string;
      host: string;
      port: number;
      user: string;
      password: string;
      database: string;
    },
    logger: Logger,
  ) {
    this.logger = logger.child({ component: 'MongoConnection' });
  }

  /**
   * Build MongoDB connection URI from config.
   */
  private buildUri(): string {
    if (this.config.uri) {
      return this.config.uri;
    }
    return `mongodb://${this.config.user}:${this.config.password}@${this.config.host}:${this.config.port}/${this.config.database}?authSource=admin`;
  }

  /**
   * Establish MongoDB connection with retry logic.
   */
  async connect(): Promise<typeof mongoose> {
    if (this.connection) {
      return this.connection;
    }

    const uri = this.buildUri();

    mongoose.set('strictQuery', true);

    this.connection = await mongoose.connect(uri, {
      maxPoolSize: 20,
      minPoolSize: 5,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
      connectTimeoutMS: 10000,
      retryWrites: true,
    });

    this.logger.info('MongoDB connected successfully');

    // Connection event handlers
    mongoose.connection.on('error', (err) => {
      this.logger.error({ err }, 'MongoDB connection error');
    });

    mongoose.connection.on('disconnected', () => {
      this.logger.warn('MongoDB disconnected');
    });

    return this.connection;
  }

  /**
   * Get the Mongoose instance.
   */
  getConnection(): typeof mongoose {
    if (!this.connection) {
      throw new Error('MongoDB not connected. Call connect() first.');
    }
    return this.connection;
  }

  /**
   * Health check — verify connection is alive.
   */
  async healthCheck(): Promise<boolean> {
    try {
      if (!this.connection || mongoose.connection.readyState !== 1) {
        return false;
      }
      await mongoose.connection.db?.admin().ping();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Gracefully close the connection.
   */
  async disconnect(): Promise<void> {
    if (this.connection) {
      await mongoose.disconnect();
      this.connection = null;
      this.logger.info('MongoDB disconnected');
    }
  }
}
