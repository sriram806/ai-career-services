import { pgTable, uuid, varchar, boolean, timestamp, integer, jsonb, index, uniqueIndex, primaryKey } from 'drizzle-orm/pg-core';

// ─── Users Table ──────────────────────────────────
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: varchar('email', { length: 255 }).notNull(),
  username: varchar('username', { length: 100 }).notNull(),
  fullName: varchar('full_name', { length: 200 }),
  phone: varchar('phone', { length: 20 }),
  university: varchar('university', { length: 255 }),
  country: varchar('country', { length: 100 }),
  status: varchar('status', { length: 50 }).notNull().default('pending_verification'),
  emailVerified: boolean('email_verified').notNull().default(false),
  phoneVerified: boolean('phone_verified').notNull().default(false),
  termsAcceptedAt: timestamp('terms_accepted_at', { withTimezone: true }),
  role: varchar('role', { length: 50 }).notNull().default('candidate'),
  failedLoginAttempts: integer('failed_login_attempts').notNull().default(0),
  lockUntil: timestamp('lock_until', { withTimezone: true }),
  lastFailedLogin: timestamp('last_failed_login', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  lastLogin: timestamp('last_login', { withTimezone: true }),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
}, (table) => {
  return {
    emailUniqueIdx: uniqueIndex('users_email_unique_idx').on(table.email),
    usernameUniqueIdx: uniqueIndex('users_username_unique_idx').on(table.username),
    phoneUniqueIdx: uniqueIndex('users_phone_unique_idx').on(table.phone),
    roleIdx: index('users_role_idx').on(table.role),
    statusIdx: index('users_status_idx').on(table.status),
  };
});

// ─── Credentials Table ─────────────────────────────
export const credentials = pgTable('credentials', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  passwordHash: varchar('password_hash', { length: 255 }).notNull(),
  mfaSecret: varchar('mfa_secret', { length: 255 }),
  mfaEnabled: boolean('mfa_enabled').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => {
  return {
    userIdUniqueIdx: uniqueIndex('credentials_user_id_unique_idx').on(table.userId),
  };
});

// ─── Sessions Table ────────────────────────────────
export const sessions = pgTable('sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  userAgent: varchar('user_agent', { length: 512 }),
  ipAddress: varchar('ip_address', { length: 45 }),
  deviceName: varchar('device_name', { length: 255 }),
  browser: varchar('browser', { length: 100 }),
  os: varchar('os', { length: 100 }),
  location: varchar('location', { length: 255 }),
  refreshTokenHash: varchar('refresh_token_hash', { length: 255 }).notNull(),
  isActive: boolean('is_active').notNull().default(true),
  lastActivityAt: timestamp('last_activity_at', { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
}, (table) => {
  return {
    userIdIdx: index('sessions_user_id_idx').on(table.userId),
    refreshTokenHashUniqueIdx: uniqueIndex('sessions_refresh_token_hash_unique_idx').on(table.refreshTokenHash),
    activeSessionIdx: index('sessions_active_idx').on(table.userId, table.isActive),
  };
});

// ─── OTP Codes Table ───────────────────────────────
export const otpCodes = pgTable('otp_codes', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  codeHash: varchar('code_hash', { length: 255 }).notNull(),
  purpose: varchar('purpose', { length: 50 }).notNull(),
  attempts: integer('attempts').notNull().default(0),
  isUsed: boolean('is_used').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
}, (table) => {
  return {
    userIdPurposeIdx: index('otp_codes_user_id_purpose_idx').on(table.userId, table.purpose),
  };
});

// ─── Refresh Tokens Table ──────────────────────────
export const refreshTokens = pgTable('refresh_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  sessionId: uuid('session_id').references(() => sessions.id, { onDelete: 'cascade' }).notNull(),
  tokenHash: varchar('token_hash', { length: 255 }).notNull(),
  parentTokenHash: varchar('parent_token_hash', { length: 255 }),
  isUsed: boolean('is_used').notNull().default(false),
  isRevoked: boolean('is_revoked').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
}, (table) => {
  return {
    tokenHashUniqueIdx: uniqueIndex('refresh_tokens_token_hash_unique_idx').on(table.tokenHash),
    userIdIdx: index('refresh_tokens_user_id_idx').on(table.userId),
    sessionIdIdx: index('refresh_tokens_session_id_idx').on(table.sessionId),
  };
});

// ─── Password History Table ────────────────────────
// Stores previous N password hashes to prevent reuse (OWASP ASVS §2.1.10).
// Only the hash is stored — original passwords are never recoverable.
export const passwordHistory = pgTable('password_history', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  passwordHash: varchar('password_hash', { length: 255 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => {
  return {
    userIdIdx: index('password_history_user_id_idx').on(table.userId),
    createdAtIdx: index('password_history_created_at_idx').on(table.createdAt),
  };
});

// ─── Email Verification Tokens Table ───────────────
// Cryptographically secure random tokens for email verification.
// SHA-256 hash stored — plaintext token is sent to user via email and never persisted.
export const emailVerificationTokens = pgTable('email_verification_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  tokenHash: varchar('token_hash', { length: 255 }).notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  usedAt: timestamp('used_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => {
  return {
    tokenHashUniqueIdx: uniqueIndex('email_verification_tokens_hash_unique_idx').on(table.tokenHash),
    userIdIdx: index('email_verification_tokens_user_id_idx').on(table.userId),
  };
});

// ─── Password Reset Tokens Table ───────────────────
// Secure, one-time-use tokens for password reset flow.
// 15-minute expiry per OWASP ASVS §2.1.6.
export const passwordResetTokens = pgTable('password_reset_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  tokenHash: varchar('token_hash', { length: 255 }).notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  usedAt: timestamp('used_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => {
  return {
    tokenHashUniqueIdx: uniqueIndex('password_reset_tokens_hash_unique_idx').on(table.tokenHash),
    userIdIdx: index('password_reset_tokens_user_id_idx').on(table.userId),
  };
});

// ─── Trusted Devices Table ─────────────────────────
// Device fingerprints that bypass future MFA challenges.
// 30-day TTL; future MFA-ready.
export const trustedDevices = pgTable('trusted_devices', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  deviceFingerprint: varchar('device_fingerprint', { length: 255 }).notNull(),
  deviceName: varchar('device_name', { length: 255 }),
  deviceNickname: varchar('device_nickname', { length: 255 }),
  browser: varchar('browser', { length: 100 }),
  os: varchar('os', { length: 100 }),
  ipAddress: varchar('ip_address', { length: 45 }),
  lastUsedAt: timestamp('last_used_at', { withTimezone: true }).notNull().defaultNow(),
  lastActiveAt: timestamp('last_active_at', { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => {
  return {
    userIdIdx: index('trusted_devices_user_id_idx').on(table.userId),
    fingerprintIdx: uniqueIndex('trusted_devices_fingerprint_idx').on(table.userId, table.deviceFingerprint),
  };
});

// ─── Login Attempts Table ──────────────────────────
// Granular record of every login attempt for security analytics
// and regulatory compliance (SOC 2, ISO 27001).
export const loginAttempts = pgTable('login_attempts', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
  email: varchar('email', { length: 255 }),
  ipAddress: varchar('ip_address', { length: 45 }),
  userAgent: varchar('user_agent', { length: 512 }),
  status: varchar('status', { length: 50 }).notNull(),
  failureReason: varchar('failure_reason', { length: 255 }),
  attemptNumber: integer('attempt_number'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => {
  return {
    userIdIdx: index('login_attempts_user_id_idx').on(table.userId),
    emailIdx: index('login_attempts_email_idx').on(table.email),
    createdAtIdx: index('login_attempts_created_at_idx').on(table.createdAt),
  };
});

// ─── Login History Table ───────────────────────────
// Kept for backward compat; new code uses loginAttempts for granularity.
export const loginHistory = pgTable('login_history', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
  email: varchar('email', { length: 255 }),
  ipAddress: varchar('ip_address', { length: 45 }),
  userAgent: varchar('user_agent', { length: 512 }),
  status: varchar('status', { length: 50 }).notNull(),
  failureReason: varchar('failure_reason', { length: 255 }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => {
  return {
    userIdIdx: index('login_history_user_id_idx').on(table.userId),
    emailIdx: index('login_history_email_idx').on(table.email),
  };
});

// ─── Security Events (Audit Log) Table ─────────────
// Append-only audit trail for SOC 2 and ISO 27001 compliance.
// NEVER stores passwords, OTPs, or tokens — only event metadata.
export const securityEvents = pgTable('security_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
  eventType: varchar('event_type', { length: 100 }).notNull(),
  ipAddress: varchar('ip_address', { length: 45 }),
  userAgent: varchar('user_agent', { length: 512 }),
  details: jsonb('details').notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => {
  return {
    userIdIdx: index('security_events_user_id_idx').on(table.userId),
    eventTypeIdx: index('security_events_type_idx').on(table.eventType),
    createdAtIdx: index('security_events_created_at_idx').on(table.createdAt),
  };
});

// ─── OAuth Accounts Table ──────────────────────────
export const oauthAccounts = pgTable('oauth_accounts', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  provider: varchar('provider', { length: 50 }).notNull(),
  providerUserId: varchar('provider_user_id', { length: 255 }).notNull(),
  providerEmail: varchar('provider_email', { length: 255 }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => {
  return {
    providerUserIdx: uniqueIndex('oauth_accounts_provider_user_idx').on(table.provider, table.providerUserId),
    userIdIdx: index('oauth_accounts_user_id_idx').on(table.userId),
  };
});

// ─── Connected Accounts Table ──────────────────────
export const connectedAccounts = pgTable('connected_accounts', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  provider: varchar('provider', { length: 50 }).notNull(),
  providerUserId: varchar('provider_user_id', { length: 255 }).notNull(),
  providerEmail: varchar('provider_email', { length: 255 }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => {
  return {
    userIdProviderIdx: uniqueIndex('connected_accounts_user_provider_idx').on(table.userId, table.provider),
  };
});

// ─── Roles Table ───────────────────────────────────
export const roles = pgTable('roles', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 100 }).notNull(),
  description: varchar('description', { length: 255 }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => {
  return {
    nameUniqueIdx: uniqueIndex('roles_name_unique_idx').on(table.name),
  };
});

// ─── Permissions Table ─────────────────────────────
export const permissions = pgTable('permissions', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 100 }).notNull(),
  description: varchar('description', { length: 255 }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => {
  return {
    nameUniqueIdx: uniqueIndex('permissions_name_unique_idx').on(table.name),
  };
});

// ─── Role Permissions Table ────────────────────────
export const rolePermissions = pgTable('role_permissions', {
  roleId: uuid('role_id').references(() => roles.id, { onDelete: 'cascade' }).notNull(),
  permissionId: uuid('permission_id').references(() => permissions.id, { onDelete: 'cascade' }).notNull(),
}, (table) => {
  return {
    pk: primaryKey({ columns: [table.roleId, table.permissionId] }),
  };
});

// ─── User Roles Table ──────────────────────────────
export const userRoles = pgTable('user_roles', {
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  roleId: uuid('role_id').references(() => roles.id, { onDelete: 'cascade' }).notNull(),
}, (table) => {
  return {
    pk: primaryKey({ columns: [table.userId, table.roleId] }),
  };
});


// ─── MFA Settings Table ────────────────────────────
export const mfaSettings = pgTable('mfa_settings', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  emailEnabled: boolean('email_enabled').notNull().default(false),
  totpEnabled: boolean('totp_enabled').notNull().default(false),
  totpSecret: varchar('totp_secret', { length: 255 }),
  smsEnabled: boolean('sms_enabled').notNull().default(false),
  smsPhone: varchar('sms_phone', { length: 50 }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => {
  return {
    userIdUniqueIdx: uniqueIndex('mfa_settings_user_id_unique_idx').on(table.userId),
  };
});

// ─── Recovery Codes Table ──────────────────────────
export const recoveryCodes = pgTable('recovery_codes', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  codeHash: varchar('code_hash', { length: 255 }).notNull(),
  isUsed: boolean('is_used').notNull().default(false),
  usedAt: timestamp('used_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => {
  return {
    userIdIdx: index('recovery_codes_user_id_idx').on(table.userId),
  };
});

// ─── Resume Metadata Table ─────────────────────────
export const resumeMetadata = pgTable('resume_metadata', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  fileName: varchar('file_name', { length: 255 }).notNull(),
  fileSize: integer('file_size').notNull(),
  mimeType: varchar('mime_type', { length: 100 }),
  filePath: varchar('file_path', { length: 512 }),
  parsedData: jsonb('parsed_data').notNull().default({}),
  status: varchar('status', { length: 50 }).notNull().default('uploaded'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => {
  return {
    userIdIdx: index('resume_metadata_user_id_idx').on(table.userId),
  };
});

// ─── Profile Events Table ──────────────────────────
export const profileEvents = pgTable('profile_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  eventType: varchar('event_type', { length: 100 }).notNull(),
  ipAddress: varchar('ip_address', { length: 45 }),
  userAgent: varchar('user_agent', { length: 512 }),
  details: jsonb('details').notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => {
  return {
    userIdIdx: index('profile_events_user_id_idx').on(table.userId),
    eventTypeIdx: index('profile_events_type_idx').on(table.eventType),
  };
});

// ─── Profile Versions Table ────────────────────────
export const profileVersions = pgTable('profile_versions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  version: integer('version').notNull(),
  profileData: jsonb('profile_data').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  createdBy: uuid('created_by').references(() => users.id),
}, (table) => {
  return {
    userIdVersionIdx: uniqueIndex('profile_versions_user_version_idx').on(table.userId, table.version),
  };
});

// ─── Uploads Table ─────────────────────────────────
export const uploads = pgTable('uploads', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  uploadType: varchar('upload_type', { length: 50 }).notNull(), // 'avatar', 'banner', 'resume', 'certificate', 'portfolio'
  fileName: varchar('file_name', { length: 255 }).notNull(),
  fileSize: integer('file_size').notNull(),
  mimeType: varchar('mime_type', { length: 100 }),
  filePath: varchar('file_path', { length: 512 }),
  meta: jsonb('meta').notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => {
  return {
    userIdIdx: index('uploads_user_id_idx').on(table.userId),
    uploadTypeIdx: index('uploads_type_idx').on(table.uploadType),
  };
});

// ─── Audit Logs Table ──────────────────────────────
export const auditLogs = pgTable('audit_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  action: varchar('action', { length: 100 }).notNull(),
  entityName: varchar('entity_name', { length: 100 }).notNull(),
  entityId: varchar('entity_id', { length: 100 }),
  ipAddress: varchar('ip_address', { length: 45 }),
  userAgent: varchar('user_agent', { length: 512 }),
  details: jsonb('details').notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => {
  return {
    userIdIdx: index('audit_logs_user_id_idx').on(table.userId),
    actionIdx: index('audit_logs_action_idx').on(table.action),
    entityIdx: index('audit_logs_entity_idx').on(table.entityName, table.entityId),
  };
});

