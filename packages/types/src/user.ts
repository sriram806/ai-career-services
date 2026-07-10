/**
 * User domain types shared across services.
 */

export interface UserProfile {
  readonly id: string;
  readonly email: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly displayName: string;
  readonly avatarUrl?: string;
  readonly bio?: string;
  readonly roles: string[];
  readonly organizationId?: string;
  readonly isActive: boolean;
  readonly isVerified: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface UserPreferences {
  readonly userId: string;
  readonly language: string;
  readonly timezone: string;
  readonly emailNotifications: boolean;
  readonly pushNotifications: boolean;
  readonly theme: 'light' | 'dark' | 'system';
}
