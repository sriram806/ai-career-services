import { z } from 'zod';

/**
 * Environment configuration schema with Zod validation.
 * Every environment variable is validated at startup — fail fast on misconfiguration.
 */
export const envSchema = z.object({
  // ─── Application ──────────────────────────────────
  NODE_ENV: z.enum(['development', 'staging', 'production', 'testing']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  PORT: z.coerce.number().int().positive().default(3000),

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
  REDIS_HOST: z.string().min(1).default('localhost'),
  REDIS_PORT: z.coerce.number().int().positive().default(6379),
  REDIS_PASSWORD: z.string().optional(),

  // ─── JWT (Placeholder) ────────────────────────────
  JWT_SECRET: z.string().min(32).default('changeme_jwt_secret_minimum_32_chars_long'),
  JWT_EXPIRATION: z.string().default('15m'),
  JWT_REFRESH_EXPIRATION: z.string().default('7d'),

  // ─── CORS ─────────────────────────────────────────
  CORS_ORIGIN: z.string().default('http://localhost:3000'),

  // ─── Rate Limiting ────────────────────────────────
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(100),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60000),

  // ─── SMTP Mailer ──────────────────────────────────
  SMTP_HOST: z.string().min(1).default('localhost'),
  SMTP_PORT: z.coerce.number().int().positive().default(1025),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_SECURE: z.coerce.boolean().default(false),
  SMTP_FROM: z.string().default('AI Career OS <noreply@aicareer.os>'),
});

/** Inferred TypeScript type from Zod schema */
export type AppConfig = z.infer<typeof envSchema>;
