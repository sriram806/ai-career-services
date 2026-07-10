import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OtpService } from '../../src/services/otp.service';
import type { OtpRepository } from '../../src/repositories/otp.repository';
import type { Redis } from 'ioredis';

describe('OtpService Unit Tests', () => {
  let mockOtpRepository: any;
  let mockRedisClient: any;
  let service: OtpService;
  let store: Record<string, string>;

  beforeEach(() => {
    store = {};
    mockOtpRepository = {
      createOtpCode: vi.fn().mockResolvedValue({ id: 'code-id' }),
      findLatestActiveCode: vi.fn(),
      incrementAttempts: vi.fn(),
      deleteOtpCode: vi.fn(),
      deleteAllUserOtpCodes: vi.fn(),
    };

    mockRedisClient = {
      get: vi.fn().mockImplementation((key) => Promise.resolve(store[key] || null)),
      set: vi.fn().mockImplementation((key, val, ...args) => {
        store[key] = String(val);
        return Promise.resolve('OK');
      }),
      del: vi.fn().mockImplementation((key) => {
        delete store[key];
        return Promise.resolve(1);
      }),
      exists: vi.fn().mockImplementation((key) => Promise.resolve(key in store ? 1 : 0)),
      incr: vi.fn().mockImplementation((key) => {
        const val = Number(store[key] || 0) + 1;
        store[key] = String(val);
        return Promise.resolve(val);
      }),
      expire: vi.fn().mockResolvedValue(1),
      ttl: vi.fn().mockResolvedValue(60),
    };

    service = new OtpService(
      mockOtpRepository as unknown as OtpRepository,
      mockRedisClient as unknown as Redis,
    );
  });

  it('should generate secure 6-digit numeric OTP and check cooldown rate limits', async () => {
    const userId = 'user-uuid';
    const purpose = 'email_verification';

    const code = await service.generateOtp(userId, purpose);
    expect(code.length).toBe(6);
    expect(/^\d+$/.test(code)).toBe(true);

    // Verify cooldown is set
    expect(store[`otp:cooldown:${userId}:${purpose}`]).toBe('1');

    // Subsequent request should throw cooldown error
    await expect(service.generateOtp(userId, purpose)).rejects.toThrow(
      'before requesting a new verification code',
    );
  });

  it('should verify correct OTP code', async () => {
    const userId = 'user-uuid';
    const purpose = 'email_verification';

    const code = await service.generateOtp(userId, purpose);

    const isVerified = await service.verifyOtp(userId, purpose, code);
    expect(isVerified).toBe(true);

    // Code is cleaned up and deleted upon successful verification
    expect(store[`otp:code:${userId}:${purpose}`]).toBeUndefined();
  });

  it('should reject incorrect OTP and block after max attempts', async () => {
    const userId = 'user-uuid';
    const purpose = 'email_verification';

    const code = await service.generateOtp(userId, purpose);

    // Attempt 1: Wrong code
    const isVerified1 = await service.verifyOtp(userId, purpose, '000000');
    expect(isVerified1).toBe(false);

    // Attempt 2: Wrong code
    const isVerified2 = await service.verifyOtp(userId, purpose, '111111');
    expect(isVerified2).toBe(false);

    // Attempt 3: Wrong code
    const isVerified3 = await service.verifyOtp(userId, purpose, '222222');
    expect(isVerified3).toBe(false);

    // Attempt 4: Wrong code
    const isVerified4 = await service.verifyOtp(userId, purpose, '333333');
    expect(isVerified4).toBe(false);

    // Attempt 5: Throws lockout limit exceeded
    await expect(service.verifyOtp(userId, purpose, '444444')).rejects.toThrow(
      'Maximum verification attempts exceeded. Please request a new code.',
    );
  });
});
