import { z } from 'zod';
import { envSchema } from '@ai-career-os/config';
import * as dotenv from 'dotenv';
import * as path from 'node:path';
import * as fs from 'node:fs';

/**
 * Gateway-specific environment configuration schema.
 * Extends the platform-wide configuration schema.
 */
export const gatewayEnvSchema = envSchema.extend({
  // ─── Downstream Microservices URLs ────────────────
  AUTH_SERVICE_URL: z.string().url().default('http://localhost:3001'),
  USER_SERVICE_URL: z.string().url().default('http://localhost:3002'),
  CAREER_SERVICE_URL: z.string().url().default('http://localhost:3003'),
  EXAM_SERVICE_URL: z.string().url().default('http://localhost:3004'),
  AI_SERVICE_URL: z.string().url().default('http://localhost:3005'),
  ORGANIZATION_SERVICE_URL: z.string().url().default('http://localhost:3006'),
  BILLING_SERVICE_URL: z.string().url().default('http://localhost:3007'),
  NOTIFICATION_SERVICE_URL: z.string().url().default('http://localhost:3008'),
  ADMIN_SERVICE_URL: z.string().url().default('http://localhost:3009'),
  ANALYTICS_SERVICE_URL: z.string().url().default('http://localhost:3010'),

  // ─── Tiered Rate Limiting Configuration ──────────
  RATE_LIMIT_VERY_STRICT: z.coerce.number().int().positive().default(5),
  RATE_LIMIT_STRICT: z.coerce.number().int().positive().default(20),
  RATE_LIMIT_MODERATE: z.coerce.number().int().positive().default(60),
  RATE_LIMIT_STANDARD: z.coerce.number().int().positive().default(100),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60000),

  // ─── Cryptographic Keys ──────────────────────────
  JWT_PUBLIC_KEY: z.string().optional(),
});

export type GatewayConfig = z.infer<typeof gatewayEnvSchema>;

let gatewayConfigInstance: GatewayConfig | null = null;

/**
 * Load and validate gateway environment configuration.
 */
export function loadGatewayConfig(envPath?: string): GatewayConfig {
  let resolvedPath = envPath;
  if (!resolvedPath) {
    let currentDir = process.cwd();
    resolvedPath = path.resolve(currentDir, '.env');
    while (!fs.existsSync(resolvedPath)) {
      const parentDir = path.dirname(currentDir);
      if (parentDir === currentDir) {
        resolvedPath = path.resolve(process.cwd(), '.env');
        break;
      }
      currentDir = parentDir;
      resolvedPath = path.resolve(currentDir, '.env');
    }
  }
  dotenv.config({ path: resolvedPath });

  const result = gatewayEnvSchema.safeParse(process.env);

  if (!result.success) {
    const errors = result.error.flatten().fieldErrors;
    const formattedErrors = Object.entries(errors)
      .map(([key, messages]) => `  ${key}: ${(messages ?? []).join(', ')}`)
      .join('\n');

    throw new Error(
      `❌ Invalid gateway configuration:\n${formattedErrors}\n\nPlease check your .env file.`,
    );
  }

  gatewayConfigInstance = result.data;
  return gatewayConfigInstance;
}

/**
 * Get the loaded gateway configuration singleton.
 */
export function getGatewayConfig(): GatewayConfig {
  if (!gatewayConfigInstance) {
    throw new Error('Gateway configuration not loaded. Call loadGatewayConfig() first.');
  }
  return gatewayConfigInstance;
}
