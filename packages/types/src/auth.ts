/**
 * Authentication and authorization type definitions.
 * These are structural types only — no business logic.
 */

export enum UserRole {
  STUDENT = 'student',
  PROFESSIONAL = 'professional',
  RECRUITER = 'recruiter',
  ORGANIZATION_ADMIN = 'organization_admin',
  UNIVERSITY_ADMIN = 'university_admin',
  PLATFORM_ADMIN = 'platform_admin',
  SUPER_ADMIN = 'super_admin',
  CANDIDATE = 'candidate',
  MENTOR = 'mentor',
  ORGANIZATION_MANAGER = 'organization_manager',
  ADMINISTRATOR = 'administrator',
  SUPER_ADMINISTRATOR = 'super_administrator',
}

export enum AuthProvider {
  LOCAL = 'local',
  GOOGLE = 'google',
  GITHUB = 'github',
  LINKEDIN = 'linkedin',
  MICROSOFT = 'microsoft',
}

export interface TokenPayload {
  readonly sub: string;
  readonly email: string;
  readonly roles: UserRole[];
  readonly organizationId?: string;
  readonly sessionId: string;
  readonly iat: number;
  readonly exp: number;
}

export interface AuthTokens {
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly expiresIn: number;
  readonly tokenType: 'Bearer';
}
