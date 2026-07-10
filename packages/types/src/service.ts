/**
 * Service discovery and health check types.
 */

export enum ServiceName {
  GATEWAY = 'gateway',
  AUTH = 'auth-service',
  USER = 'user-service',
  CAREER = 'career-service',
  EXAM = 'exam-service',
  AI = 'ai-service',
  ORGANIZATION = 'organization-service',
  BILLING = 'billing-service',
  NOTIFICATION = 'notification-service',
  ADMIN = 'admin-service',
  ANALYTICS = 'analytics-service',
}

export type ServiceStatus = 'healthy' | 'degraded' | 'unhealthy';

export interface HealthCheckResponse {
  readonly status: ServiceStatus;
  readonly service: ServiceName;
  readonly version: string;
  readonly uptime: number;
  readonly timestamp: string;
  readonly checks: Record<string, {
    readonly status: ServiceStatus;
    readonly responseTime?: number;
    readonly message?: string;
  }>;
}
