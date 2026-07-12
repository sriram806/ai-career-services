import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';

import { errorHandler } from '@ai-career-os/errors';
import { requestLoggerPlugin } from '@ai-career-os/logger';
import { CONSTANTS } from '@ai-career-os/common';
import { loadConfig } from '@ai-career-os/config';
import {
  PostgresConnection,
  MongoConnection,
  RedisConnection,
} from '@ai-career-os/database';
import { EventBus } from '@ai-career-os/events';

// ─── Repositories ─────────────────────────────────
import { ProfileRepository } from './repositories/profile.repository';
import { MetadataRepository } from './repositories/metadata.repository';

// ─── Services ─────────────────────────────────────
import { JwtService } from './services/jwt.service';
import { ProfileCompletionEngine } from './services/completion-engine.service';
import { ProfileService } from './services/profile.service';

// ─── Controllers & Routes ─────────────────────────
import { ProfileController } from './controllers/profile.controller';
import { registerProfileRoutes } from './routes/profile.routes';
import { healthRoutes } from './routes/health';

export async function buildApp(logger: any): Promise<any> {
  const config = loadConfig();

  const app = Fastify({
    loggerInstance: logger,
    genReqId: () => crypto.randomUUID(),
    requestIdHeader: CONSTANTS.HEADERS.REQUEST_ID,
    disableRequestLogging: true,
  });

  // ─── Database & Cache Connections ─────────────────
  const postgres = new PostgresConnection(
    {
      host: config.POSTGRES_HOST,
      port: config.POSTGRES_PORT,
      user: config.POSTGRES_USER,
      password: config.POSTGRES_PASSWORD,
      database: config.POSTGRES_DB,
    },
    logger,
  );

  const mongo = new MongoConnection(
    {
      uri: config.MONGO_URI,
      host: config.MONGO_HOST,
      port: config.MONGO_PORT,
      user: config.MONGO_USER,
      password: config.MONGO_PASSWORD,
      database: config.MONGO_DB,
    },
    logger,
  );

  const redis = new RedisConnection(
    {
      host: config.REDIS_HOST,
      port: config.REDIS_PORT,
      password: config.REDIS_PASSWORD,
    },
    logger,
  );

  const eventBus = new EventBus(
    {
      host: config.REDIS_HOST,
      port: config.REDIS_PORT,
      password: config.REDIS_PASSWORD,
    },
    logger,
  );

  // Connect lifecycles
  const db = await postgres.connect();
  await mongo.connect();
  const redisClient = await redis.connect();
  await eventBus.connect();

  // Cleanup on close
  app.addHook('onClose', async () => {
    await postgres.disconnect();
    await mongo.disconnect();
    await redis.disconnect();
    await eventBus.disconnect();
  });

  // ─── Repositories ─────────────────────────────────
  const profileRepo = new ProfileRepository();
  const metadataRepo = new MetadataRepository(db);

  // ─── Services ─────────────────────────────────────
  const jwtService = new JwtService({
    secret: config.JWT_SECRET,
    issuer: 'ai-career-os-auth',
    audience: 'ai-career-os-app',
  });

  const completionEngine = new ProfileCompletionEngine();

  const profileService = new ProfileService(
    profileRepo,
    metadataRepo,
    completionEngine,
    redisClient,
    eventBus,
  );

  // ─── Controllers ──────────────────────────────────
  const profileController = new ProfileController(profileService);

  // ─── Security Middleware ──────────────────────────
  await app.register(helmet, { contentSecurityPolicy: false });
  const corsOrigins = config.CORS_ORIGIN
    ? config.CORS_ORIGIN.split(',').map((o) => o.trim())
    : ['http://localhost:3000'];

  await app.register(cors, {
    origin: corsOrigins,
    credentials: true,
  });

  // ─── Documentation ────────────────────────────────
  await app.register(swagger, {
    openapi: {
      info: {
        title: 'AI Career OS — Unified Student Profile Service',
        description:
          'Authoritative single-source-of-truth service for student career identity, profile completion engine, and activity event stream.',
        version: '0.1.0',
      },
      servers: [
        { url: `http://localhost:${config.PORT ?? 3002}`, description: 'Development' },
      ],
      tags: [
        { name: 'profile', description: 'Student profile operations' },
        { name: 'health', description: 'Health check endpoints' },
      ],
    },
  });

  await app.register(swaggerUi, {
    routePrefix: CONSTANTS.API.DOCS_PATH,
  });

  // ─── Plugins ──────────────────────────────────────
  await app.register(requestLoggerPlugin);

  // ─── Error Handler ────────────────────────────────
  app.setErrorHandler(errorHandler);

  // ─── Routes ───────────────────────────────────────
  await app.register(healthRoutes);
  registerProfileRoutes(app, profileController, jwtService);

  return app;
}
