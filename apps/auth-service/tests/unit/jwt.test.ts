import { describe, it, expect } from 'vitest';
import { JwtService } from '../../src/services/jwt.service';

describe('JwtService Unit Tests', () => {
  const secret = 'test_secret_key_long_enough_to_meet_entropy_rules';
  const service = new JwtService({ secret });

  it('should generate and verify access tokens', () => {
    const payload = {
      userId: '4cfcb867-b50a-4a25-a13a-ff67f525d886',
      email: 'user@example.com',
      role: 'candidate',
      sessionId: '9e735d64-e402-4fc4-bb9e-bf33eb63a992',
    };

    const token = service.generateAccessToken(payload);
    expect(token).toBeDefined();

    const decoded = service.verifyAccessToken(token);
    expect(decoded.sub).toBe(payload.userId);
    expect(decoded.email).toBe(payload.email);
    expect(decoded.role).toBe(payload.role);
    expect(decoded.sessionId).toBe(payload.sessionId);
    expect(decoded.iss).toBe('ai-career-os-auth');
    expect(decoded.aud).toBe('ai-career-os-app');
  });

  it('should generate cryptographically secure random refresh tokens', () => {
    const token1 = service.generateRefreshToken();
    const token2 = service.generateRefreshToken();

    expect(token1.length).toBe(100); // 48 bytes * 2 hex chars + 4 char prefix ('ses_' or 'rem_')
    expect(token1).not.toBe(token2);
  });

  it('should compute sha256 hash of tokens correctly', () => {
    const token = 'my_refresh_token';
    const hash = service.hashToken(token);

    // sha256 hash is always 64 hex chars
    expect(hash.length).toBe(64);
  });
});
