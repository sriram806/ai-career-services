/**
 * Platform-wide constants.
 * Centralized to avoid magic numbers and strings across services.
 */
export const CONSTANTS = {
  /** API versioning */
  API: {
    VERSION: 'v1',
    PREFIX: '/api/v1',
    HEALTH_PATH: '/health',
    DOCS_PATH: '/docs',
  },

  /** Pagination */
  PAGINATION: {
    DEFAULT_PAGE: 1,
    DEFAULT_LIMIT: 20,
    MAX_LIMIT: 100,
    MIN_LIMIT: 1,
  },

  /** HTTP Headers */
  HEADERS: {
    REQUEST_ID: 'x-request-id',
    CORRELATION_ID: 'x-correlation-id',
    SERVICE_NAME: 'x-service-name',
    SERVICE_VERSION: 'x-service-version',
    AUTHORIZATION: 'authorization',
    CONTENT_TYPE: 'content-type',
  },

  /** Cache TTL (seconds) */
  CACHE: {
    SHORT: 60,
    MEDIUM: 300,
    LONG: 3600,
    DAY: 86400,
  },

  /** Service Ports */
  PORTS: {
    GATEWAY: 3000,
    AUTH_SERVICE: 3001,
    USER_SERVICE: 3002,
    CAREER_SERVICE: 3003,
    EXAM_SERVICE: 3004,
    AI_SERVICE: 3005,
    ORG_SERVICE: 3006,
    BILLING_SERVICE: 3007,
    NOTIFICATION_SERVICE: 3008,
    ADMIN_SERVICE: 3009,
    ANALYTICS_SERVICE: 3010,
  },

  /** File upload limits */
  UPLOAD: {
    MAX_FILE_SIZE: 10 * 1024 * 1024, // 10MB
    MAX_FILES: 5,
    ALLOWED_MIME_TYPES: [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'image/jpeg',
      'image/png',
      'image/webp',
    ],
  },

  /** Password requirements */
  PASSWORD: {
    MIN_LENGTH: 8,
    MAX_LENGTH: 128,
    SALT_ROUNDS: 12,
  },
} as const;
