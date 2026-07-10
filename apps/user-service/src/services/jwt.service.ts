import * as jwt from 'jsonwebtoken';

export interface AccessTokenPayload {
  sub: string; // User ID
  email: string;
  role: string;
  roles?: string[];
  permissions?: string[];
  sessionId: string;
  iss: string;
  aud: string;
  v: string;
}

export class JwtService {
  private readonly secret: string;
  private readonly issuer: string;
  private readonly audience: string;

  constructor(config: { secret: string; issuer?: string; audience?: string }) {
    this.secret = config.secret;
    this.issuer = config.issuer ?? 'ai-career-os-auth';
    this.audience = config.audience ?? 'ai-career-os-app';
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
        throw err;
      }
      throw new Error('Invalid token');
    }
  }
}
