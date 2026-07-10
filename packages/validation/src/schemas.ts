import { z } from 'zod';

/**
 * Common validation schemas reused across services.
 */
export const commonSchemas = {
  /** UUID v4 */
  uuid: z.string().uuid(),

  /** Email address */
  email: z.string().email().toLowerCase().trim(),

  /** Pagination query params */
  paginationQuery: z.object({
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(100).default(20),
    sortBy: z.string().optional(),
    sortOrder: z.enum(['asc', 'desc']).default('desc'),
  }),

  /** ID parameter */
  idParam: z.object({
    id: z.string().uuid(),
  }),

  /** Non-empty string */
  nonEmptyString: z.string().min(1).trim(),

  /** Password (placeholder rules) */
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(128, 'Password must be at most 128 characters'),

  /** URL */
  url: z.string().url(),

  /** ISO date string */
  isoDate: z.string().datetime(),
} as const;
