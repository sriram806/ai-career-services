import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { Logger } from 'pino';

/**
 * PostgreSQL connection manager using pg Pool + Drizzle ORM.
 * Manages connection lifecycle and provides a Drizzle instance.
 */
export class PostgresConnection {
  private pool: Pool | null = null;
  private db: NodePgDatabase | null = null;
  private readonly logger: Logger;

  constructor(
    private readonly config: {
      host: string;
      port: number;
      user: string;
      password: string;
      database: string;
      maxConnections?: number;
    },
    logger: Logger,
  ) {
    this.logger = logger.child({ component: 'PostgresConnection' });
  }

  /**
   * Establish connection pool and initialize Drizzle ORM.
   */
  async connect(): Promise<NodePgDatabase> {
    if (this.db) {
      return this.db;
    }

    this.pool = new Pool({
      host: this.config.host,
      port: this.config.port,
      user: this.config.user,
      password: this.config.password,
      database: this.config.database,
      max: this.config.maxConnections ?? 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });

    // Test connection
    const client = await this.pool.connect();
    const result = await client.query('SELECT NOW()');
    client.release();

    this.logger.info(
      { timestamp: result.rows[0] },
      'PostgreSQL connected successfully',
    );

    this.db = drizzle(this.pool);
    return this.db;
  }

  /**
   * Get the Drizzle database instance.
   */
  getDb(): NodePgDatabase {
    if (!this.db) {
      throw new Error('PostgreSQL not connected. Call connect() first.');
    }
    return this.db;
  }

  /**
   * Health check — verify connection is alive.
   */
  async healthCheck(): Promise<boolean> {
    try {
      if (!this.pool) {
        return false;
      }
      const client = await this.pool.connect();
      await client.query('SELECT 1');
      client.release();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Gracefully close all connections.
   */
  async disconnect(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
      this.db = null;
      this.logger.info('PostgreSQL disconnected');
    }
  }
}
