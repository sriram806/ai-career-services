/**
 * Event-driven architecture type contracts.
 * These define the schema for all inter-service events.
 */

/** Base event structure — all events must extend this */
export interface BaseEvent<T = unknown> {
  readonly eventId: string;
  readonly eventType: string;
  readonly source: string;
  readonly timestamp: string;
  readonly correlationId: string;
  readonly version: string;
  readonly payload: T;
}

/** Event topic names */
export enum EventTopic {
  USER_EVENTS = 'user.events',
  AUTH_EVENTS = 'auth.events',
  CAREER_EVENTS = 'career.events',
  EXAM_EVENTS = 'exam.events',
  BILLING_EVENTS = 'billing.events',
  NOTIFICATION_EVENTS = 'notification.events',
  ORGANIZATION_EVENTS = 'organization.events',
  AI_EVENTS = 'ai.events',
  ANALYTICS_EVENTS = 'analytics.events',
}

/** Event type enums per domain */
export enum UserEventType {
  USER_CREATED = 'user.created',
  USER_UPDATED = 'user.updated',
  USER_DELETED = 'user.deleted',
  USER_VERIFIED = 'user.verified',
  USER_DEACTIVATED = 'user.deactivated',
}

export enum AuthEventType {
  LOGIN_SUCCESS = 'auth.login.success',
  LOGIN_FAILED = 'auth.login.failed',
  LOGOUT = 'auth.logout',
  PASSWORD_CHANGED = 'auth.password.changed',
  PASSWORD_RESET_REQUESTED = 'auth.password.reset.requested',
  TOKEN_REFRESHED = 'auth.token.refreshed',
}

export enum CareerEventType {
  RESUME_UPLOADED = 'career.resume.uploaded',
  RESUME_ANALYZED = 'career.resume.analyzed',
  JOB_MATCH_FOUND = 'career.job.match.found',
  CAREER_PATH_GENERATED = 'career.path.generated',
}

export enum BillingEventType {
  SUBSCRIPTION_CREATED = 'billing.subscription.created',
  SUBSCRIPTION_UPDATED = 'billing.subscription.updated',
  SUBSCRIPTION_CANCELLED = 'billing.subscription.cancelled',
  PAYMENT_SUCCEEDED = 'billing.payment.succeeded',
  PAYMENT_FAILED = 'billing.payment.failed',
}
