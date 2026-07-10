import * as dotenv from 'dotenv';
import * as path from 'node:path';
import * as fs from 'node:fs';

import { envSchema } from './schema';

import type { AppConfig } from './schema';

/** Singleton config instance */
let configInstance: AppConfig | null = null;

/**
 * Load and validate environment configuration.
 * Reads .env file relative to the service's working directory.
 * Uses Zod to validate — throws immediately on invalid config.
 *
 * @param envPath - Optional path to .env file
 * @returns Validated configuration object
 */
export function loadConfig(envPath?: string): AppConfig {
  // Load .env file
  let resolvedPath = envPath;
  if (!resolvedPath) {
    let currentDir = process.cwd();
    resolvedPath = path.resolve(currentDir, '.env');
    while (!fs.existsSync(resolvedPath)) {
      const parentDir = path.dirname(currentDir);
      if (parentDir === currentDir) {
        // Reached filesystem root, fallback to process.cwd()
        resolvedPath = path.resolve(process.cwd(), '.env');
        break;
      }
      currentDir = parentDir;
      resolvedPath = path.resolve(currentDir, '.env');
    }
  }
  dotenv.config({ path: resolvedPath });

  // Validate environment variables
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    const errors = result.error.flatten().fieldErrors;
    const formattedErrors = Object.entries(errors)
      .map(([key, messages]) => `  ${key}: ${(messages ?? []).join(', ')}`)
      .join('\n');

    throw new Error(
      `❌ Invalid environment configuration:\n${formattedErrors}\n\nPlease check your .env file.`,
    );
  }

  configInstance = result.data;
  return configInstance;
}

/**
 * Get the current configuration.
 * Must call loadConfig() first.
 *
 * @returns Validated configuration object
 * @throws Error if config not loaded
 */
export function getConfig(): AppConfig {
  if (!configInstance) {
    throw new Error('Configuration not loaded. Call loadConfig() first.');
  }
  return configInstance;
}
