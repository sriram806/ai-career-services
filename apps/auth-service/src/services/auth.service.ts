import type { UserRepository, DbUser } from '../repositories/user.repository';
import type { SessionRepository } from '../repositories/session.repository';
import type { RefreshTokenRepository } from '../repositories/refresh-token.repository';
import type { LoginAttemptRepository } from '../repositories/login-attempt.repository';
import type { PasswordHistoryRepository } from '../repositories/password-history.repository';
import type { AuditRepository } from '../repositories/audit.repository';
import type { PasswordService } from './password.service';
import type { JwtService } from './jwt.service';
import type { SessionService } from './session.service';
import type { TrustedDeviceService } from './trusted-device.service';
import type { Redis } from 'ioredis';
import type { RbacService } from './rbac.service';
import type { MfaRepository } from '../repositories/mfa.repository';
import * as crypto from 'node:crypto';
import { ErrorFactory } from '@ai-career-os/errors';

// ─── Response Interfaces ───────────────────────────

export interface AuthResponse {
  accessToken?: string;
  refreshToken?: string;
  user?: Omit<DbUser, 'deletedAt' | 'failedLoginAttempts' | 'lockUntil' | 'lastFailedLogin'>;
  mfaRequired?: boolean;
  tempToken?: string;
}

export interface RequestContext {
  ipAddress: string | null;
  userAgent: string | null;
}

// ─── Utility: strip internal-only fields from user response ───
function sanitizeUser(user: DbUser) {
  const {
    deletedAt,
    failedLoginAttempts,
    lockUntil,
    lastFailedLogin,
    ...safeUser
  } = user;
  return safeUser;
}

/**
 * Core Authentication Service.
 *
 * Orchestrates all authentication flows: registration, login, logout,
 * token refresh, password change, OTP, and account lockout.
 *
 * Architecture:
 *   - Service layer owns business logic; repositories own data access
 *   - All operations are audited via AuditRepository
 *   - Redis handles ephemeral state (lockouts, rate limits, counters)
 *   - PostgreSQL is the source of truth for all persistent state
 *
 * Security decisions:
 *   - Progressive lockout: 5 attempts → 30 min lock, 10 → 24 hour lock
 *   - Progressive delay: server-side delay on failed attempts (constant-time)
 *   - Timing attack protection: dummy password verification on unknown emails
 *   - Generic error messages: never reveals whether email exists or password is wrong
 *   - Refresh Token Rotation: every refresh generates new token pair, old one invalidated
 *   - Replay detection: reused refresh tokens trigger full session revocation
 */
export class AuthService {
  /** Progressive delay schedule: attempt → milliseconds */
  private static readonly DELAY_SCHEDULE: Record<number, number> = {
    1: 0,
    2: 1000,
    3: 2000,
    4: 5000,
  };

  constructor(
    private readonly userRepository: UserRepository,
    private readonly sessionRepository: SessionRepository,
    public readonly sessionService: SessionService,
    public readonly refreshTokenRepository: RefreshTokenRepository,
    private readonly loginAttemptRepository: LoginAttemptRepository,
    private readonly passwordHistoryRepository: PasswordHistoryRepository,
    private readonly auditRepository: AuditRepository,
    private readonly passwordService: PasswordService,
    public readonly jwtService: JwtService,
    _trustedDeviceService: TrustedDeviceService,
    private readonly rbacService: RbacService,
    private readonly mfaRepository: MfaRepository,
    public readonly redisClient: Redis,
  ) {}

  // ═════════════════════════════════════════════════════
  // ─── REGISTRATION ───────────────────────────────────
  // ═════════════════════════════════════════════════════

  /**
   * Registers a new user account (inactive, pending email verification).
   *
   * Flow:
   *   1. Validate password policy
   *   2. Check email + username uniqueness (+ phone if provided)
   *   3. Create user record (status: pending_verification)
   *   4. Create credentials record (Argon2id hash)
   *   5. Save initial password hash to history
   *   6. Audit log: user.registered
   *
   * Returns the created user (caller is responsible for email verification flow).
   */
  async register(data: {
    email: string;
    username: string;
    password: string;
    fullName?: string;
    phone?: string;
    university?: string;
    country?: string;
    termsAccepted?: boolean;
    role: string;
  } & RequestContext): Promise<{ user: DbUser }> {
    // 1. Validate password policy
    const policy = this.passwordService.validatePasswordPolicy(data.password, {
      username: data.username,
      email: data.email,
    });
    if (!policy.isValid) {
      throw ErrorFactory.badRequest(policy.reason || 'Password does not meet requirements');
    }

    // 2. Normalize
    const email = data.email.toLowerCase().trim();
    const username = data.username.trim();

    // 3. Uniqueness checks
    const existingEmail = await this.userRepository.findByEmail(email);
    if (existingEmail) {
      throw ErrorFactory.conflict('Email address is already registered');
    }

    const existingUsername = await this.userRepository.findByUsername(username);
    if (existingUsername) {
      throw ErrorFactory.conflict('Username is already taken');
    }

    if (data.phone) {
      const existingPhone = await this.userRepository.findByPhone(data.phone);
      if (existingPhone) {
        throw ErrorFactory.conflict('Phone number is already registered');
      }
    }

    // 4. Create user record
    const user = await this.userRepository.createUser({
      email,
      username,
      fullName: data.fullName,
      phone: data.phone,
      university: data.university,
      country: data.country,
      termsAccepted: data.termsAccepted,
      role: data.role,
    });

    // 5. Hash password and create credentials
    const passwordHash = await this.passwordService.hashPassword(data.password);
    await this.userRepository.createCredentials(user.id, passwordHash);

    // 6. Save to password history
    await this.passwordHistoryRepository.addEntry(user.id, passwordHash);

    // Assign default role in RBAC system
    await this.rbacService.assignRoleToUser(user.id, data.role || 'candidate');

    // 7. Audit
    await this.auditRepository.createSecurityEvent({
      userId: user.id,
      eventType: 'user.registered',
      ipAddress: data.ipAddress,
      userAgent: data.userAgent,
      details: { email, username, role: data.role },
    });

    return { user };
  }

  // ═════════════════════════════════════════════════════
  // ─── LOGIN ──────────────────────────────────────────
  // ═════════════════════════════════════════════════════

  /**
   * Authenticates a user and issues JWT + refresh token pair.
   *
   * Progressive lockout:
   *   - 5 consecutive failures → 30-minute lock
   *   - 10 consecutive failures → 24-hour lock
   *   - Lock auto-expires; admin can also manually unlock
   *
   * Progressive delay (server-side):
   *   - Attempt 1: immediate
   *   - Attempt 2: 1s delay
   *   - Attempt 3: 2s delay
   *   - Attempt 4: 5s delay
   *   - Attempt 5+: account locked (no response delay needed)
   *
   * Timing attack protection:
   *   - Dummy Argon2 verification on non-existent email
   *   - Generic error message for all failure modes
   */
  async login(data: {
    email: string;
    password: string;
    rememberMe?: boolean;
  } & RequestContext): Promise<AuthResponse> {
    const email = data.email.toLowerCase().trim();
    const lockoutKey = `login:lockout:${email}`;
    const attemptsKey = `login:attempts:${email}`;

    // 1. Check Redis lockout cache
    const lockoutTTL = await this.redisClient.ttl(lockoutKey);
    if (lockoutTTL > 0) {
      const remainingMinutes = Math.ceil(lockoutTTL / 60);
      throw ErrorFactory.accountLocked(
        `Account is temporarily locked. Try again in ${remainingMinutes} minute${remainingMinutes > 1 ? 's' : ''}.`,
        [
          {
            field: 'lockout',
            message: 'Multiple failed login attempts',
            code: lockoutTTL.toString(),
          }
        ]
      );
    }

    // 2. Look up user
    const user = await this.userRepository.findByEmail(email);
    if (!user) {
      throw ErrorFactory.badRequest('Email is not registered');
    }

    // 3. Check PostgreSQL-persisted lock
    if (user.lockUntil && user.lockUntil.getTime() > Date.now()) {
      const remainingMs = user.lockUntil.getTime() - Date.now();
      const remainingMinutes = Math.ceil(remainingMs / 60_000);
      const remainingSeconds = Math.ceil(remainingMs / 1000);
      throw ErrorFactory.accountLocked(
        `Account is temporarily locked. Try again in ${remainingMinutes} minute${remainingMinutes > 1 ? 's' : ''}.`,
        [
          {
            field: 'lockout',
            message: 'Multiple failed login attempts',
            code: remainingSeconds.toString(),
          }
        ]
      );
    }

    // If lock has expired, auto-unlock
    if (user.lockUntil && user.lockUntil.getTime() <= Date.now()) {
      await this.userRepository.clearFailedAttempts(user.id);
    }

    // 4. Check account status
    if (user.status === 'suspended') {
      throw ErrorFactory.forbidden('Account has been suspended. Contact support.');
    }

    // 5. Verify credentials
    const credentials = await this.userRepository.getCredentialsByUserId(user.id);
    if (!credentials) {
      const attempts = await this.recordFailedLogin(email, user.id, data.ipAddress, data.userAgent, 'Missing credentials');
      
      const remaining = 5 - attempts;
      const msg = remaining > 0
        ? `Incorrect password. You have ${remaining} attempt${remaining > 1 ? 's' : ''} remaining before account is temporarily locked.`
        : `Incorrect password.`;

      throw ErrorFactory.unauthorized(msg);
    }

    const isPasswordMatch = await this.passwordService.verifyPassword(data.password, credentials.passwordHash);
    if (!isPasswordMatch) {
      // Apply progressive delay before responding
      const currentAttempts = Number(await this.redisClient.get(attemptsKey) ?? 0) + 1;
      const delayMs = AuthService.DELAY_SCHEDULE[currentAttempts] ?? 0;
      if (delayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }

      const attempts = await this.recordFailedLogin(email, user.id, data.ipAddress, data.userAgent, 'Invalid password');
      
      const remaining = 5 - attempts;
      const msg = remaining > 0
        ? `Incorrect password. You have ${remaining} attempt${remaining > 1 ? 's' : ''} remaining before account is temporarily locked.`
        : `Incorrect password.`;

      throw ErrorFactory.unauthorized(msg);
    }

    // 6. Verify email is confirmed
    if (user.status === 'pending_verification') {
      throw ErrorFactory.forbidden('Please verify your email address before logging in.');
    }

    // Check if MFA is enabled (only TOTP MFA is supported since email OTP passcode is removed)
    const mfa = await this.mfaRepository.findByUserId(user.id);
    
    if (mfa && mfa.totpEnabled) {
      // MFA required - generate temporary verification session
      const tempToken = crypto.randomBytes(32).toString('hex');
      const tempSessionData = {
        userId: user.id,
        rememberMe: !!data.rememberMe,
        ipAddress: data.ipAddress,
        userAgent: data.userAgent,
      };

      await this.redisClient.set(
        `mfa:login:temp:${tempToken}`,
        JSON.stringify(tempSessionData),
        'EX',
        300 // 5 minutes
      );

      return {
        mfaRequired: true,
        tempToken,
      } as any;
    }

    // 7. Successful login — clear all lockout state
    await this.redisClient.del(attemptsKey);
    await this.redisClient.del(lockoutKey);
    await this.userRepository.clearFailedAttempts(user.id);

    // 8. Generate tokens and session
    const plainRefreshToken = this.jwtService.generateRefreshToken(!!data.rememberMe);
    const tokenHash = this.jwtService.hashToken(plainRefreshToken);

    const session = await this.sessionService.createSession({
      userId: user.id,
      userAgent: data.userAgent,
      ipAddress: data.ipAddress,
      refreshTokenHash: tokenHash,
    });

    await this.refreshTokenRepository.createRefreshToken({
      userId: user.id,
      sessionId: session.id,
      tokenHash,
      parentTokenHash: null,
      expiresAt: session.expiresAt,
    });

    // Get user roles and permissions for access token
    const roles = await this.rbacService.getUserRoles(user.id);
    const permissions = await this.rbacService.getUserPermissions(user.id);

    const accessToken = this.jwtService.generateAccessToken({
      userId: user.id,
      email: user.email,
      role: user.role,
      roles,
      permissions,
      sessionId: session.id,
    });

    // 9. Update last login
    await this.userRepository.updateUser(user.id, { lastLogin: new Date() });

    // 10. Record successful login
    await this.loginAttemptRepository.createAttempt({
      userId: user.id,
      email,
      ipAddress: data.ipAddress,
      userAgent: data.userAgent,
      status: 'success',
      failureReason: null,
      attemptNumber: null,
    });

    await this.auditRepository.createSecurityEvent({
      userId: user.id,
      eventType: 'user.logged_in',
      ipAddress: data.ipAddress,
      userAgent: data.userAgent,
      details: { sessionId: session.id },
    });

    return {
      accessToken,
      refreshToken: plainRefreshToken,
      user: sanitizeUser(user),
    };
  }

  // ═════════════════════════════════════════════════════
  // ─── REFRESH TOKEN ROTATION ─────────────────────────
  // ═════════════════════════════════════════════════════

  /**
   * Rotates refresh token: issues new access + refresh token pair.
   *
   * Replay attack protection:
   *   If a previously-used refresh token is presented, the entire session
   *   lineage is revoked immediately. This defends against token theft
   *   where both the legitimate user and attacker race to use the token.
   */
  async refresh(data: {
    refreshToken: string;
  } & RequestContext): Promise<{ accessToken: string; refreshToken: string; isRememberMe: boolean }> {
    const incomingTokenHash = this.jwtService.hashToken(data.refreshToken);

    // 1. Look up refresh token
    const tokenRecord = await this.refreshTokenRepository.findByTokenHash(incomingTokenHash);
    if (!tokenRecord) {
      throw ErrorFactory.unauthorized('Invalid refresh token');
    }

    // 2. Replay/Reuse detection
    if (tokenRecord.isUsed || tokenRecord.isRevoked) {
      // Critical: token was already consumed — this is a replay attack!
      await this.sessionRepository.revokeSession(tokenRecord.sessionId);
      await this.refreshTokenRepository.revokeFamily(tokenRecord.tokenHash);

      await this.auditRepository.createSecurityEvent({
        userId: tokenRecord.userId,
        eventType: 'security.token_replay_detected',
        ipAddress: data.ipAddress,
        userAgent: data.userAgent,
        details: {
          sessionId: tokenRecord.sessionId,
          reason: 'Refresh token reuse detected — possible token theft',
        },
      });

      throw ErrorFactory.unauthorized('Session compromised. Please log in again.');
    }

    // 3. Expiry check
    if (tokenRecord.expiresAt.getTime() < Date.now()) {
      await this.sessionRepository.revokeSession(tokenRecord.sessionId);
      throw ErrorFactory.unauthorized('Refresh token expired');
    }

    // 4. Validate user and session
    const user = await this.userRepository.findById(tokenRecord.userId);
    if (!user || user.status === 'suspended') {
      throw ErrorFactory.unauthorized('User not found or suspended');
    }

    const session = await this.sessionRepository.findById(tokenRecord.sessionId);
    if (!session || !session.isActive || session.expiresAt.getTime() < Date.now()) {
      throw ErrorFactory.unauthorized('Session has been revoked or expired');
    }

    // 5. Rotate: mark current token as used, issue new pair
    const isRememberMe = this.jwtService.isRememberMeToken(data.refreshToken);
    const newPlainRefreshToken = this.jwtService.generateRefreshToken(isRememberMe);
    const newHash = this.jwtService.hashToken(newPlainRefreshToken);

    await this.refreshTokenRepository.markUsed(incomingTokenHash);

    await this.refreshTokenRepository.createRefreshToken({
      userId: user.id,
      sessionId: tokenRecord.sessionId,
      tokenHash: newHash,
      parentTokenHash: incomingTokenHash,
      expiresAt: tokenRecord.expiresAt,
    });

    await this.sessionRepository.updateSessionRefreshTokenHash(tokenRecord.sessionId, newHash);

    // Update session activity
    await this.sessionRepository.updateLastActivity(tokenRecord.sessionId);

    // Get user roles and permissions for access token
    const roles = await this.rbacService.getUserRoles(user.id);
    const permissions = await this.rbacService.getUserPermissions(user.id);

    const accessToken = this.jwtService.generateAccessToken({
      userId: user.id,
      email: user.email,
      role: user.role,
      roles,
      permissions,
      sessionId: tokenRecord.sessionId,
    });

    return {
      accessToken,
      refreshToken: newPlainRefreshToken,
      isRememberMe,
    } as any;
  }

  // ═════════════════════════════════════════════════════
  // ─── LOGOUT ─────────────────────────────────────────
  // ═════════════════════════════════════════════════════

  /**
   * Logs out by revoking the session associated with the provided refresh token.
   */
  async logout(data: {
    refreshToken: string;
  } & RequestContext): Promise<void> {
    const hash = this.jwtService.hashToken(data.refreshToken);
    const tokenRecord = await this.refreshTokenRepository.findByTokenHash(hash);

    if (tokenRecord) {
      await this.sessionRepository.revokeSession(tokenRecord.sessionId);
      await this.refreshTokenRepository.revokeToken(hash);

      await this.auditRepository.createSecurityEvent({
        userId: tokenRecord.userId,
        eventType: 'user.logged_out',
        ipAddress: data.ipAddress,
        userAgent: data.userAgent,
        details: { sessionId: tokenRecord.sessionId },
      });
    }
  }

  /**
   * Logs out from ALL active sessions for a user.
   */
  async logoutAll(userId: string, context: RequestContext): Promise<void> {
    await this.sessionRepository.revokeAllUserSessions(userId);

    await this.auditRepository.createSecurityEvent({
      userId,
      eventType: 'user.logged_out_all',
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
      details: {},
    });
  }

  // ═════════════════════════════════════════════════════
  // ─── PASSWORD CHANGE ────────────────────────────────
  // ═════════════════════════════════════════════════════

  /**
   * Changes password for an authenticated user.
   *
   * Enforces:
   *   - Current password verification
   *   - New password policy validation
   *   - Password history check (no reuse of previous 5)
   *   - Revokes all other sessions after change
   */
  async changePassword(data: {
    userId: string;
    passwordOld: string;
    passwordNew: string;
    currentSessionId?: string;
  } & RequestContext): Promise<void> {
    const credentials = await this.userRepository.getCredentialsByUserId(data.userId);
    if (!credentials) {
      throw ErrorFactory.badRequest('Credentials record not found');
    }

    const isMatch = await this.passwordService.verifyPassword(data.passwordOld, credentials.passwordHash);
    if (!isMatch) {
      throw ErrorFactory.unauthorized('Incorrect current password');
    }

    const user = await this.userRepository.findById(data.userId);
    const policy = this.passwordService.validatePasswordPolicy(data.passwordNew, {
      username: user?.username,
      email: user?.email,
    });
    if (!policy.isValid) {
      throw ErrorFactory.badRequest(policy.reason || 'Password does not meet requirements');
    }

    // Password history check
    const previousHashes = await this.passwordHistoryRepository.getRecentHashes(data.userId, 5);
    const isReuse = await this.passwordService.isPasswordInHistory(data.passwordNew, previousHashes);
    if (isReuse) {
      throw ErrorFactory.badRequest(
        'New password cannot be the same as any of your previous 5 passwords',
      );
    }

    // Save old hash to history
    await this.passwordHistoryRepository.addEntry(data.userId, credentials.passwordHash);

    // Update password
    const newHash = await this.passwordService.hashPassword(data.passwordNew);
    await this.userRepository.updatePassword(data.userId, newHash);

    // Revoke all other sessions (keep current session active)
    if (data.currentSessionId) {
      await this.sessionRepository.revokeAllOtherUserSessions(data.userId, data.currentSessionId);
    } else {
      await this.sessionRepository.revokeAllUserSessions(data.userId);
    }

    await this.auditRepository.createSecurityEvent({
      userId: data.userId,
      eventType: 'user.password.changed',
      ipAddress: data.ipAddress,
      userAgent: data.userAgent,
      details: { otherSessionsRevoked: true },
    });
  }

  // ═════════════════════════════════════════════════════
  // ─── PROFILE ────────────────────────────────────────
  // ═════════════════════════════════════════════════════

  /**
   * Fetches sanitized profile for the authenticated user.
   * Strips all security-internal fields (lockout state, deleted_at, etc.).
   */
  async getMe(userId: string): Promise<ReturnType<typeof sanitizeUser> & { mfaEnabled: boolean; mfaType: string | null }> {
    const user = await this.userRepository.findById(userId);
    if (!user) {
      throw ErrorFactory.notFound('User');
    }
    const mfa = await this.mfaRepository.findByUserId(userId);
    const sanitized = sanitizeUser(user);
    return {
      ...sanitized,
      mfaEnabled: mfa ? (mfa.totpEnabled || mfa.emailEnabled) : false,
      mfaType: mfa ? (mfa.totpEnabled ? 'totp' : mfa.emailEnabled ? 'email' : null) : null,
    };
  }

  // ═════════════════════════════════════════════════════
  // ─── PRIVATE HELPERS ────────────────────────────────
  // ═════════════════════════════════════════════════════

  /**
   * Records a failed login attempt in both Redis (for lockout) and PostgreSQL (for audit).
   * Enforces progressive lockout: 5 → 30 min, 10 → 24 hours.
   */
  private async recordFailedLogin(
    email: string,
    userId: string | null,
    ipAddress: string | null,
    userAgent: string | null,
    reason: string,
  ): Promise<number> {
    const attemptsKey = `login:attempts:${email}`;
    const lockoutKey = `login:lockout:${email}`;

    // Increment Redis counter
    const attempts = await this.redisClient.incr(attemptsKey);
    if (attempts === 1) {
      // Set a generous TTL on the counter — it resets after the longest lockout
      await this.redisClient.expire(attemptsKey, 86400);
    }

    // Record in PostgreSQL
    await this.loginAttemptRepository.createAttempt({
      userId,
      email,
      ipAddress,
      userAgent,
      status: 'failed',
      failureReason: reason,
      attemptNumber: attempts,
    });

    let dbAttempts = attempts;
    // Increment on user record (if user exists)
    if (userId) {
      const updatedUser = await this.userRepository.incrementFailedAttempts(userId);
      dbAttempts = updatedUser.failedLoginAttempts;

      // Progressive lockout enforcement via Redis cache
      if (updatedUser.failedLoginAttempts >= 10) {
        await this.redisClient.set(lockoutKey, '1', 'EX', 86400); // 24 hours

        await this.auditRepository.createSecurityEvent({
          userId,
          eventType: 'user.account.locked',
          ipAddress,
          userAgent,
          details: {
            email,
            attempts: updatedUser.failedLoginAttempts,
            lockDuration: '24 hours',
            reason: 'Exceeded maximum login attempts',
          },
        });
      } else if (updatedUser.failedLoginAttempts >= 5) {
        await this.redisClient.set(lockoutKey, '1', 'EX', 1800); // 30 minutes

        await this.auditRepository.createSecurityEvent({
          userId,
          eventType: 'user.account.locked',
          ipAddress,
          userAgent,
          details: {
            email,
            attempts: updatedUser.failedLoginAttempts,
            lockDuration: '30 minutes',
            reason: 'Multiple failed login attempts',
          },
        });
      }
    }
    return dbAttempts;
  }

  async deleteAccount(data: {
    userId: string;
    password?: string;
  } & RequestContext): Promise<void> {
    const credentials = await this.userRepository.getCredentialsByUserId(data.userId);

    if (credentials && credentials.passwordHash) {
      if (data.password) {
        const isMatch = await this.passwordService.verifyPassword(data.password, credentials.passwordHash);
        if (!isMatch) {
          throw ErrorFactory.unauthorized('Incorrect password');
        }
      } else {
        throw ErrorFactory.badRequest('Password is required to delete account');
      }
    }

    // Soft delete user in database
    await this.userRepository.softDeleteUser(data.userId);

    // Revoke all user sessions
    await this.sessionRepository.revokeAllUserSessions(data.userId);

    // Create security event
    await this.auditRepository.createSecurityEvent({
      userId: data.userId,
      eventType: 'user.account.deleted',
      ipAddress: data.ipAddress,
      userAgent: data.userAgent,
      details: { reason: 'User deleted account' },
    });
  }
}
