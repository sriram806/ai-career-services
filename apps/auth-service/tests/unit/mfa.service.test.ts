import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MfaService } from '../../src/services/mfa.service';
import { Totp } from '../../src/utils/totp';

describe('MfaService Unit Tests', () => {
  let mockMfaRepository: any;
  let mockAuditRepository: any;

  let mockRedisClient: any;
  let service: MfaService;
  let redisStore: Record<string, string>;

  beforeEach(() => {
    redisStore = {};
    mockMfaRepository = {
      findByUserId: vi.fn().mockResolvedValue({
        id: 'settings-id',
        userId: 'user-uuid',
        totpEnabled: true,
        totpSecret: 'MOCKSECRET32CHARS234567',
        emailEnabled: false,
      }),
      upsertSettings: vi.fn().mockResolvedValue({ id: 'settings-id' }),
      saveRecoveryCodes: vi.fn().mockResolvedValue(undefined),
      findRecoveryCodesByUserId: vi.fn().mockImplementation(() => {
        const crypto = require('node:crypto');
        const hash = crypto.createHash('sha256').update('TEST-CODE').digest('hex');
        return Promise.resolve([
          { id: 'c1', codeHash: hash, isUsed: false }
        ]);
      }),
      markRecoveryCodeUsed: vi.fn().mockResolvedValue(undefined),
      deleteRecoveryCodes: vi.fn().mockResolvedValue(undefined),
    };

    mockAuditRepository = {
      createSecurityEvent: vi.fn().mockResolvedValue(undefined),
    };



    mockRedisClient = {
      get: vi.fn().mockImplementation((key) => Promise.resolve(redisStore[key] || null)),
      set: vi.fn().mockImplementation((key, val) => {
        redisStore[key] = String(val);
        return Promise.resolve('OK');
      }),
      del: vi.fn().mockImplementation((key) => {
        delete redisStore[key];
        return Promise.resolve(1);
      }),
    };

    service = new MfaService(mockMfaRepository, mockAuditRepository, mockRedisClient);
  });

  it('should initiate TOTP setup and store temporary secret in Redis', async () => {
    const { secret, qrCodeUri } = await service.initiateTotpSetup('user-uuid', 'user@example.com');

    expect(secret).toBeDefined();
    expect(qrCodeUri).toContain('otpauth://totp/');
    expect(redisStore['mfa:setup:totp:user-uuid']).toBe(secret);
  });

  it('should enable TOTP upon verification and generate recovery codes', async () => {
    const secret = Totp.generateSecret();
    redisStore['mfa:setup:totp:user-uuid'] = secret;

    // Generate valid TOTP token for test verification
    const counter = Math.floor(Date.now() / 30000);
    // Directly use Totp.verifyToken or generate the token using internal method
    // Since verifyToken matches, let's create a token
    const token = (Totp as any).generateTokenForCounter((Totp as any).decodeBase32(secret), counter);

    const recoveryCodes = await service.verifyAndEnableTotp('user-uuid', token, { ipAddress: '127.0.0.1', userAgent: 'test' });

    expect(recoveryCodes.length).toBe(10);
    expect(mockMfaRepository.upsertSettings).toHaveBeenCalled();
    expect(mockMfaRepository.saveRecoveryCodes).toHaveBeenCalled();
    expect(redisStore['mfa:setup:totp:user-uuid']).toBeUndefined(); // clean up
  });

  it('should verify active TOTP code successfully during validation', async () => {
    const secret = 'MOCKSECRET32CHARS234567';
    const counter = Math.floor(Date.now() / 30000);
    const token = (Totp as any).generateTokenForCounter((Totp as any).decodeBase32(secret), counter);

    const verified = await service.verifyMfaToken('user-uuid', token);
    expect(verified).toBe(true);
  });

  it('should verify recovery code successfully and mark it as used', async () => {
    // Hash of 'TEST-CODE' is '98d5c4ffbdfb5749f7e8a93cb0c19b266d734898399581896898d9e6f3d9d3d3'
    const verified = await service.verifyMfaToken('user-uuid', 'TEST-CODE');

    expect(verified).toBe(true);
    expect(mockMfaRepository.markRecoveryCodeUsed).toHaveBeenCalledWith('c1');
  });

  it('should disable MFA successfully and clean up recovery codes', async () => {
    const secret = 'MOCKSECRET32CHARS234567';
    const counter = Math.floor(Date.now() / 30000);
    const token = (Totp as any).generateTokenForCounter((Totp as any).decodeBase32(secret), counter);

    await service.disableMfa('user-uuid', token, { ipAddress: '127.0.0.1', userAgent: 'test' });

    expect(mockMfaRepository.upsertSettings).toHaveBeenCalledWith({
      userId: 'user-uuid',
      totpEnabled: false,
      totpSecret: null,
      emailEnabled: false,
      smsEnabled: false,
    });
    expect(mockMfaRepository.deleteRecoveryCodes).toHaveBeenCalledWith('user-uuid');
  });
});
