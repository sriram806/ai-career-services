import fp from 'fastify-plugin';
import { RedisConnection } from '@ai-career-os/database';
import { getGatewayConfig } from '../config/gateway-config';
import type { Redis } from 'ioredis';
import type { FastifyInstance } from 'fastify';

declare module 'fastify' {
  interface FastifyInstance {
    redis: Redis;
    redisConnection: RedisConnection;
  }
}

/**
 * Fastify plugin to manage the Redis connection lifecycle.
 * Decorates Fastify instance with redis and redisConnection.
 */
export const redisPlugin = fp((fastify: FastifyInstance, _opts: any, done: (err?: Error) => void) => {
  const config = getGatewayConfig();

  const redisConnection = new RedisConnection(
    {
      host: config.REDIS_HOST,
      port: config.REDIS_PORT,
      password: config.REDIS_PASSWORD,
    },
    fastify.log as any,
  );

  fastify.log.info('Connecting to Redis...');
  
  redisConnection
    .connect()
    .then((client) => {
      fastify.decorate('redisConnection', redisConnection);
      fastify.decorate('redis', client);

      fastify.addHook('onClose', async () => {
        fastify.log.info('Disconnecting from Redis...');
        await redisConnection.disconnect();
      });

      done();
    })
    .catch((err) => {
      done(err);
    });
});
