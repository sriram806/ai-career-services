import { CONSTANTS } from '@ai-career-os/common';
import { getConfig } from '@ai-career-os/config';
import { PostgresConnection, RedisConnection } from '@ai-career-os/database';
import { errorHandler } from '@ai-career-os/errors';
import { requestLoggerPlugin } from '@ai-career-os/logger';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import Fastify from 'fastify';
import swaggerUi from '@fastify/swagger-ui';

// ─── Repositories ─────────────────────────────────
import { AuthController } from './controllers/auth.controller';
import { AuditRepository } from './repositories/audit.repository';
import { LoginAttemptRepository } from './repositories/login-attempt.repository';
import { MfaRepository } from './repositories/mfa.repository';
import { OAuthRepository } from './repositories/oauth.repository';
import { OtpRepository } from './repositories/otp.repository';
import { PasswordHistoryRepository } from './repositories/password-history.repository';
import { PasswordResetRepository } from './repositories/password-reset.repository';
import { RefreshTokenRepository } from './repositories/refresh-token.repository';
import { SessionRepository } from './repositories/session.repository';
import { UserRepository } from './repositories/user.repository';

import { TrustedDeviceRepository } from './repositories/trusted-device.repository';
import { RbacRepository } from './repositories/rbac.repository';

// ─── Services ─────────────────────────────────────
import { registerAuthRoutes } from './routes/auth';
import { healthRoutes } from './routes/health';
import { AuthService } from './services/auth.service';
import { EmailVerificationService } from './services/email-verification.service';
import { EmailService } from './services/email.service';
import { JwtService } from './services/jwt.service';
import { MfaService } from './services/mfa.service';
import { OAuthService } from './services/oauth.service';
import { OtpService } from './services/otp.service';
import { PasswordResetService } from './services/password-reset.service';
import { PasswordService } from './services/password.service';

import { DataExportService } from './services/data-export.service';
import { RbacService } from './services/rbac.service';
import { SessionService } from './services/session.service';
import { TrustedDeviceService } from './services/trusted-device.service';



export async function buildApp(logger: any): Promise<any> {
  const config = getConfig();

  const app = Fastify({
    loggerInstance: logger,
    genReqId: () => crypto.randomUUID(),
    requestIdHeader: CONSTANTS.HEADERS.REQUEST_ID,
    disableRequestLogging: true,
  });

  // ─── Database Connections ────────────────────────
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

  const redis = new RedisConnection(
    {
      url: config.REDIS_URL,
      host: config.REDIS_HOST,
      port: config.REDIS_PORT,
      password: config.REDIS_PASSWORD,
    },
    logger,
  );

  const db = await postgres.connect();
  const redisClient = await redis.connect();

  // Execute Drizzle database schema auto-migrations
  try {
    await postgres.runMigrations();
  } catch (err) {
    logger.error({ err }, 'Failed to execute database migrations on startup');
  }

  // Clean up on shutdown
  app.addHook('onClose', async () => {
    await postgres.disconnect();
    await redis.disconnect();
  });

  // ─── Repository Layer ───────────────────────────
  const userRepository = new UserRepository(db);
  const sessionRepository = new SessionRepository(db);

  const refreshTokenRepository = new RefreshTokenRepository(db);
  const auditRepository = new AuditRepository(db);
  const passwordHistoryRepository = new PasswordHistoryRepository(db);
  const passwordResetRepository = new PasswordResetRepository(db);
  const trustedDeviceRepository = new TrustedDeviceRepository(db);
  const loginAttemptRepository = new LoginAttemptRepository(db);
  const oauthRepository = new OAuthRepository(db);
  const mfaRepository = new MfaRepository(db);
  const rbacRepository = new RbacRepository(db);
  const otpRepository = new OtpRepository(db);

  // ─── Service Layer ──────────────────────────────
  const emailService = new EmailService(
    {
      host: config.SMTP_HOST,
      port: config.SMTP_PORT,
      user: config.SMTP_USER,
      pass: config.SMTP_PASS,
      secure: config.SMTP_SECURE,
      from: config.SMTP_FROM,
      frontendUrl: config.CORS_ORIGIN,
    },
    logger,
  );

  const passwordService = new PasswordService();

  const jwtService = new JwtService({
    secret: config.JWT_SECRET,
    issuer: 'ai-career-os-auth',
    audience: 'ai-career-os-app',
  });

  const sessionService = new SessionService(sessionRepository);

  const trustedDeviceService = new TrustedDeviceService(trustedDeviceRepository, auditRepository);

  const otpService = new OtpService(otpRepository, userRepository, redisClient, emailService);
  const mfaService = new MfaService(mfaRepository, auditRepository, redisClient, otpService);
  const rbacService = new RbacService(rbacRepository, auditRepository, redisClient);

  const oauthService = new OAuthService(
    oauthRepository,
    userRepository,
    sessionService,
    refreshTokenRepository,
    auditRepository,
    rbacService,
    jwtService,
    redisClient,
  );

  // Seed default roles and permissions after schema exists
  try {
    await rbacService.seedRolesAndPermissions();
    logger.info('Default roles and permissions seeded successfully');
  } catch (err) {
    logger.error({ err }, 'Failed to seed default roles and permissions');
  }

  const emailVerificationService = new EmailVerificationService(
    userRepository,
    auditRepository,
    otpService,
  );

  const passwordResetService = new PasswordResetService(
    passwordResetRepository,
    userRepository,
    sessionRepository,
    passwordHistoryRepository,
    auditRepository,
    passwordService,
    redisClient,
    emailService,
  );

  const authService = new AuthService(
    userRepository,
    sessionRepository,
    sessionService,
    refreshTokenRepository,
    loginAttemptRepository,
    passwordHistoryRepository,
    auditRepository,
    passwordService,
    jwtService,
    trustedDeviceService,
    rbacService,
    mfaRepository,
    redisClient,
  );

  const dataExportService = new DataExportService(
    userRepository,
    sessionRepository,
    mfaRepository,
    oauthRepository,
    auditRepository,
    emailService,
    redisClient,
  );

  // ─── Controller Layer ───────────────────────────
  const authController = new AuthController(
    authService,
    emailVerificationService,
    passwordResetService,
    sessionService,
    trustedDeviceService,
    mfaService,
    dataExportService,
    otpService,

    rbacService,
    oauthService,
    auditRepository,
    sessionRepository,
    userRepository,
  );

  // ─── Decorate Fastify for test access ───────────
  app.decorate('postgres', postgres);
  app.decorate('redis', redis);
  app.decorate('userRepository', userRepository);
  app.decorate('sessionRepository', sessionRepository);
  app.decorate('refreshTokenRepository', refreshTokenRepository);
  app.decorate('auditRepository', auditRepository);
  app.decorate('authService', authService);
  app.decorate('sessionService', sessionService);
  app.decorate('jwtService', jwtService);
  app.decorate('emailVerificationService', emailVerificationService);
  app.decorate('passwordResetService', passwordResetService);
  app.decorate('trustedDeviceService', trustedDeviceService);
  app.decorate('mfaService', mfaService);

  app.decorate('rbacService', rbacService);
  app.decorate('oauthService', oauthService);

  // ─── Plugins & Security Middleware ──────────────
  await app.register(helmet, { contentSecurityPolicy: false });
  const corsOrigins = config.CORS_ORIGIN ? config.CORS_ORIGIN.split(',').map((o) => o.trim()) : ['http://localhost:3000'];

  await app.register(cors, {
    origin: corsOrigins,
    credentials: true,
  });
  await app.register(cookie);

  // Redis-backed rate limiting
  await app.register(rateLimit, {
    redis: redisClient,
    max: config.RATE_LIMIT_MAX,
    timeWindow: config.RATE_LIMIT_WINDOW_MS,
    skipOnError: true,
  });

  // ─── Request Logger & Error Handling ────────────
  await app.register(requestLoggerPlugin);
  app.setErrorHandler(errorHandler);

  // ─── API Documentation ─────────────────────────
  await app.register(swagger, {
    openapi: {
      info: {
        title: 'AI Career OS — Authentication Service',
        description:
          'Enterprise identity provider: registration, authentication, authorization, ' +
          'session management, device trust, password reset, OTP, and audit logging.',
        version: '1.0.0',
      },
      servers: [{ url: `http://localhost:${config.PORT}`, description: 'Local Development' }],
      tags: [
        { name: 'auth', description: 'Authentication lifecycle endpoints' },
        { name: 'health', description: 'Health check endpoints' },
      ],
    },
  });

  await app.register(swaggerUi, {
    routePrefix: CONSTANTS.API.DOCS_PATH,
  });

  // ─── Routes ────────────────────────────────────
  await app.register(healthRoutes);
  registerAuthRoutes(app, authController, jwtService);

  return app;
}
