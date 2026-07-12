import * as jwt from 'jsonwebtoken';
import * as crypto from 'node:crypto';
import type { UserRole } from '@ai-career-os/types';

export interface AccessTokenPayload {
  sub: string; // User ID
  email: string;
  role: string;
  roles?: string[];
  permissions?: string[];
  sessionId: string;
  iss: string;
  aud: string;
  v: string; // JWT Version for key rotation / tracking
}

export class JwtService {
  private readonly secret: string;
  private readonly issuer: string;
  private readonly audience: string;
  private readonly jwtVersion = 'v1';

  constructor(config: { secret: string; issuer?: string; audience?: string }) {
    this.secret = config.secret;
    this.issuer = config.issuer ?? 'ai-career-os-auth';
    this.audience = config.audience ?? 'ai-career-os-app';
  }

  /**
   * Generates a stateless JWT access token.
   */
  generateAccessToken(data: {
    userId: string;
    email: string;
    role: UserRole | string;
    roles?: string[];
    permissions?: string[];
    sessionId: string;
  }): string {
    const payload: AccessTokenPayload = {
      sub: data.userId,
      email: data.email,
      role: data.role,
      roles: data.roles || [data.role as string],
      permissions: data.permissions || [],
      sessionId: data.sessionId,
      iss: this.issuer,
      aud: this.audience,
      v: this.jwtVersion,
    };

    return jwt.sign(payload, this.secret, {
      algorithm: 'HS256',
      expiresIn: '15m',
    });
  }

  /**
   * Verifies an access token and returns payload.
   */
  verifyAccessToken(token: string): AccessTokenPayload {
    try {
      const decoded = jwt.verify(token, this.secret, {
        issuer: this.issuer,
        audience: this.audience,
        algorithms: ['HS256'],
      });
      return decoded as AccessTokenPayload;
    } catch (err: any) {
      if (err instanceof jwt.TokenExpiredError) {
        throw err; // propagates so caller can identify expired vs invalid
      }
      throw new Error('Invalid token');
    }
  }

  /**
   * Generates a cryptographically secure random string to be used as a Refresh Token.
   */
  generateRefreshToken(rememberMe = false): string {
    const prefix = rememberMe ? 'rem_' : 'ses_';
    return prefix + crypto.randomBytes(48).toString('hex');
  }

  /**
   * Checks if the refresh token prefix indicates a persistent Remember Me session.
   */
  isRememberMeToken(token: string): boolean {
    return token.startsWith('rem_');
  }

  /**
   * Computes a SHA-256 hash of a Refresh Token to store in the database.
   * This guarantees that if our database is compromised, active refresh tokens cannot be stolen.
   */
  hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }
}
