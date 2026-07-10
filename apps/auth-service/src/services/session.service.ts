import type { SessionRepository, DbSession } from '../repositories/session.repository';

export interface DeviceMetadata {
  deviceName: string;
  browser: string;
  os: string;
}

/**
 * Session lifecycle management service.
 *
 * Enforces the max-5-active-sessions policy: when a user logs in on a 6th device,
 * the oldest session is automatically revoked. This prevents:
 *   - Session accumulation from abandoned devices
 *   - Credential sharing across too many simultaneous devices
 *
 * Session records are never deleted — they're marked inactive with revokedAt
 * for audit trail compliance.
 */
export class SessionService {
  private readonly refreshTokenExpiryDays = 30;
  private readonly maxActiveSessions = 5;

  constructor(private readonly sessionRepository: SessionRepository) {}

  /**
   * Creates a new session, enforcing the max active sessions policy.
   * If the user already has maxActiveSessions, the oldest is revoked first.
   */
  async createSession(data: {
    userId: string;
    userAgent: string | null;
    ipAddress: string | null;
    refreshTokenHash: string;
  }): Promise<DbSession> {
    const { deviceName, browser, os } = this.parseUserAgent(data.userAgent);
    const expiresAt = new Date(Date.now() + this.refreshTokenExpiryDays * 24 * 60 * 60 * 1000);

    // Enforce max active sessions policy
    const activeCount = await this.sessionRepository.countActiveSessions(data.userId);
    if (activeCount >= this.maxActiveSessions) {
      // Revoke the oldest session to make room
      const oldest = await this.sessionRepository.findOldestActiveSession(data.userId);
      if (oldest) {
        await this.sessionRepository.revokeSession(oldest.id);
      }
    }

    return this.sessionRepository.createSession({
      userId: data.userId,
      userAgent: data.userAgent,
      ipAddress: data.ipAddress,
      deviceName,
      browser,
      os,
      location: null, // Placeholder — integrate GeoIP lookup in production
      refreshTokenHash: data.refreshTokenHash,
      expiresAt,
    });
  }

  /**
   * Checks if a session is active and not expired.
   */
  async isSessionActive(sessionId: string): Promise<boolean> {
    const session = await this.sessionRepository.findById(sessionId);
    if (!session || !session.isActive) return false;
    return session.expiresAt.getTime() > Date.now();
  }

  /**
   * Revokes a single session by ID.
   */
  async revokeSession(sessionId: string): Promise<void> {
    await this.sessionRepository.revokeSession(sessionId);
  }

  /**
   * Revokes all sessions for a user.
   * Used for: logout-all, password reset, account compromise.
   */
  async revokeAllUserSessions(userId: string): Promise<void> {
    await this.sessionRepository.revokeAllUserSessions(userId);
  }

  /**
   * Revokes all sessions EXCEPT the current one.
   * Used for: "Logout other devices" functionality.
   */
  async revokeAllOtherUserSessions(userId: string, activeSessionId: string): Promise<void> {
    await this.sessionRepository.revokeAllOtherUserSessions(userId, activeSessionId);
  }

  /**
   * Retrieves all active sessions for a user (for "Manage Sessions" UI).
   * Strips the refreshTokenHash for security before returning.
   */
  async getActiveSessions(userId: string): Promise<Omit<DbSession, 'refreshTokenHash'>[]> {
    const sessions = await this.sessionRepository.findActiveSessionsByUserId(userId);
    return sessions.map(({ refreshTokenHash, ...rest }) => rest);
  }

  /**
   * Updates the last activity timestamp for a session.
   * Called on each authenticated request to track "last seen".
   */
  async touchSession(sessionId: string): Promise<void> {
    await this.sessionRepository.updateLastActivity(sessionId);
  }

  /**
   * Parses the User-Agent header to extract device metadata.
   */
  private parseUserAgent(userAgent: string | null): DeviceMetadata {
    if (!userAgent) {
      return { deviceName: 'Unknown Device', browser: 'Unknown Browser', os: 'Unknown OS' };
    }

    let os = 'Unknown OS';
    let browser = 'Unknown Browser';
    let deviceName = 'Desktop';

    if (/Windows/i.test(userAgent)) os = 'Windows';
    else if (/Macintosh|Mac OS X/i.test(userAgent)) os = 'macOS';
    else if (/Linux/i.test(userAgent)) os = 'Linux';
    else if (/Android/i.test(userAgent)) os = 'Android';
    else if (/iPhone|iPad|iPod/i.test(userAgent)) os = 'iOS';

    if (/Chrome/i.test(userAgent) && !/Edge|Chrome\-Lighthouse/i.test(userAgent)) browser = 'Chrome';
    else if (/Safari/i.test(userAgent) && !/Chrome/i.test(userAgent)) browser = 'Safari';
    else if (/Firefox/i.test(userAgent)) browser = 'Firefox';
    else if (/Edg/i.test(userAgent)) browser = 'Edge';

    if (/Mobile|Android|iPhone|iPod/i.test(userAgent)) {
      deviceName = /iPad/i.test(userAgent) ? 'Tablet' : 'Mobile';
    }

    return { deviceName, browser, os };
  }
}
