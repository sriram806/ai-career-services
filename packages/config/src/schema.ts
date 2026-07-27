import { z } from 'zod';

/**
 * Environment configuration schema with Zod validation.
 * Every environment variable is validated at startup — fail fast on misconfiguration.
 */
export const envSchema = z.object({
  // ─── Application ──────────────────────────────────
  NODE_ENV: z.enum(['development', 'staging', 'production', 'testing', 'test']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  PORT: z.coerce.number().int().positive().default(3000),
  API_VERSION: z.string().default('v1'),

  // ─── PostgreSQL ───────────────────────────────────
  POSTGRES_HOST: z.string().min(1).default('localhost'),
  POSTGRES_PORT: z.coerce.number().int().positive().default(5432),
  POSTGRES_USER: z.string().min(1).default('ai_career_os'),
  POSTGRES_PASSWORD: z.string().min(1).default('changeme_postgres'),
  POSTGRES_DB: z.string().min(1).default('ai_career_os'),

  // ─── MongoDB ──────────────────────────────────────
  MONGO_URI: z.string().url().optional(),
  MONGO_HOST: z.string().min(1).default('localhost'),
  MONGO_PORT: z.coerce.number().int().positive().default(27017),
  MONGO_USER: z.string().min(1).default('ai_career_os'),
  MONGO_PASSWORD: z.string().min(1).default('changeme_mongo'),
  MONGO_DB: z.string().min(1).default('ai_career_os'),

  // ─── Redis ────────────────────────────────────────
  REDIS_URL: z.string().optional(),
  REDIS_HOST: z.string().min(1).default('localhost'),
  REDIS_PORT: z.coerce.number().int().positive().default(6379),
  REDIS_PASSWORD: z.string().optional(),

  // ─── JWT (Placeholder) ────────────────────────────
  JWT_SECRET: z.string().min(32).default('changeme_jwt_secret_minimum_32_chars_long'),
  JWT_EXPIRATION: z.string().default('15m'),
  JWT_REFRESH_EXPIRATION: z.string().default('7d'),

  // ─── CORS ─────────────────────────────────────────
  CORS_ORIGIN: z.string().default('http://localhost:3000'),
  AUTH_OAUTH_REDIRECT_URI: z
    .string()
    .url()
    .default('http://localhost:4000/api/v1/auth/oauth/callback'),

  // ─── Rate Limiting ────────────────────────────────
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(100),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60000),

  // ─── Brevo SMTP Mailer ────────────────────────────
  SMTP_HOST: z.string().min(1).default('smtp-relay.brevo.com'),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_SECURE: z
    .preprocess((val) => (typeof val === 'string' ? val.toLowerCase() === 'true' : Boolean(val)), z.boolean())
    .default(false),
  SMTP_FROM: z.string().default('AI Career OS <boddusriram1234@gmail.com>'),

  // ─── GitHub OAuth Ingestion ──────────────────────
  GITHUB_CLIENT_ID: z.string().default('mock_github_client_id'),
  GITHUB_CLIENT_SECRET: z.string().default('mock_github_client_secret'),
  GITHUB_OAUTH_ENCRYPTION_KEY: z
    .string()
    .length(64)
    .default('00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff'),

  GOOGLE_CLIENT_ID: z.string().default('mock_google_client_id'),
  GOOGLE_CLIENT_SECRET: z.string().default('mock_google_client_secret'),

  // ─── Microsoft OAuth ──────────────────────────────
  MICROSOFT_CLIENT_ID: z.string().default('mock_microsoft_client_id'),
  MICROSOFT_CLIENT_SECRET: z.string().default('mock_microsoft_client_secret'),

  // ─── LinkedIn OAuth ───────────────────────────────
  LINKEDIN_CLIENT_ID: z.string().default('mock_linkedin_client_id'),
  LINKEDIN_CLIENT_SECRET: z.string().default('mock_linkedin_client_secret'),
  LINKEDIN_REDIRECT_URI: z
    .string()
    .url()
    .default('http://localhost:4000/api/v1/profile/linkedin/oauth/callback'),
  LINKEDIN_FRONTEND_REDIRECT: z.string().default('http://localhost:3000/profile/linkedin'),

  // ─── S3 Compatible Storage ────────────────────────
  S3_ENDPOINT: z.string().default('http://localhost:9000'),
  S3_ACCESS_KEY: z.string().default('changeme_s3_access'),
  S3_SECRET_KEY: z.string().default('changeme_s3_secret'),
  S3_BUCKET: z.string().default('ai-career-os'),
  S3_REGION: z.string().default('us-east-1'),

  // ─── Service Ports ─────────────────────────────────
  GATEWAY_PORT: z.coerce.number().int().positive().default(4000),
  AUTH_SERVICE_PORT: z.coerce.number().int().positive().default(3001),
  USER_SERVICE_PORT: z.coerce.number().int().positive().default(3002),
  CAREER_SERVICE_PORT: z.coerce.number().int().positive().default(3003),
  EXAM_SERVICE_PORT: z.coerce.number().int().positive().default(3004),
  AI_SERVICE_PORT: z.coerce.number().int().positive().default(3005),
  ORG_SERVICE_PORT: z.coerce.number().int().positive().default(3006),
  BILLING_SERVICE_PORT: z.coerce.number().int().positive().default(3007),
  NOTIFICATION_SERVICE_PORT: z.coerce.number().int().positive().default(3008),
  ADMIN_SERVICE_PORT: z.coerce.number().int().positive().default(3009),
  ANALYTICS_SERVICE_PORT: z.coerce.number().int().positive().default(3010),
  GITHUB_IMPORT_SERVICE_PORT: z.coerce.number().int().positive().default(3012),
});

/** Inferred TypeScript type from Zod schema */
export type AppConfig = z.infer<typeof envSchema>;
