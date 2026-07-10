import { ErrorFactory } from '@ai-career-os/errors';

import type { ZodSchema, ZodIssue } from 'zod';

/**
 * Validate data against a Zod schema.
 * Throws AppError with structured validation details on failure.
 */
export function validate<T>(schema: ZodSchema<T>, data: unknown): T {
  const result = schema.safeParse(data);

  if (!result.success) {
    const details = result.error.issues.map((issue: ZodIssue) => ({
      field: issue.path.join('.'),
      message: issue.message,
      code: issue.code,
    }));

    throw ErrorFactory.validationError(details);
  }

  return result.data;
}

/**
 * Convert Zod schema to Fastify JSON Schema format.
 * This allows Fastify to use Zod schemas for request validation
 * while still benefiting from Ajv's compiled validation performance.
 */
export function zodToFastifySchema(schema: ZodSchema): Record<string, unknown> {
  // Use zod-to-json-schema in production — this is a placeholder
  // that returns a permissive schema for the foundation phase.
  return {
    type: 'object',
    additionalProperties: true,
    description: `Schema: ${schema.description ?? 'N/A'}`,
  };
}
