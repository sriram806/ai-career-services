/**
 * Request context types for cross-cutting concerns.
 * Propagated through middleware and available in every handler.
 */

/** User identity extracted from JWT (placeholder) */
export interface AuthenticatedUser {
  readonly userId: string;
  readonly email: string;
  readonly roles: string[];
  readonly organizationId?: string;
  readonly sessionId: string;
}

/** Request context available in all service handlers */
export interface RequestContext {
  readonly requestId: string;
  readonly correlationId: string;
  readonly timestamp: string;
  readonly ip: string;
  readonly userAgent: string;
  readonly user?: AuthenticatedUser;
}

/** Service-to-service internal request headers */
export interface InternalHeaders {
  readonly 'x-request-id': string;
  readonly 'x-correlation-id': string;
  readonly 'x-service-name': string;
  readonly 'x-service-version': string;
}
