import { describe, it, expect, vi, beforeEach } from 'vitest';
import { loadConfig } from '@ai-career-os/config';
process.env.NODE_ENV = 'testing';
process.env.JWT_SECRET = 'test_jwt_secret_minimum_32_chars_long';
loadConfig();
import { PasskeyService } from '../../src/services/passkey.service';

// Mock WebAuthn helper
vi.mock('../../src/utils/webauthn', () => {
  return {
    WebAuthn: {
      verifyClientData: vi.fn().mockReturnValue({}),
      verifySignature: vi.fn().mockReturnValue(true),
      parseAttestation: vi.fn().mockReturnValue({
        credentialId: 'mock-cred-id',
        publicKeyJwk: { kty: 'EC', crv: 'P-256', x: 'xxx', y: 'yyy' },
        counter: 1,
      }),
    },
  };
});

describe('PasskeyService Unit Tests', () => {
  let mockPasskeyRepository: any;
  let mockUserRepository: any;
  let mockAuditRepository: any;
  let mockRedisClient: any;
  let service: PasskeyService;
  let redisStore: Record<string, string>;

  beforeEach(() => {
    redisStore = {};
    mockPasskeyRepository = {
      findAllForUser: vi.fn().mockResolvedValue([]),
      findByCredentialId: vi.fn().mockResolvedValue(null),
      createPasskey: vi.fn().mockImplementation((data) => Promise.resolve({ id: 'key-id', ...data })),
      findById: vi.fn().mockResolvedValue({ id: 'key-id', userId: 'user-uuid', credentialId: 'mock-cred-id', publicKey: '{}', counter: 0 }),
      updateCounter: vi.fn().mockResolvedValue(undefined),
      updateNickname: vi.fn().mockResolvedValue(undefined),
      deletePasskey: vi.fn().mockResolvedValue(undefined),
    };

    mockUserRepository = {
      findByEmail: vi.fn().mockResolvedValue({ id: 'user-uuid', email: 'user@example.com', role: 'candidate' }),
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

    service = new PasskeyService(
      mockPasskeyRepository,
      mockUserRepository,
      mockAuditRepository,
      mockRedisClient,
    );
  });

  it('should generate registration options', async () => {
    const options = await service.generateRegisterOptions('user-uuid', 'user@example.com');

    expect(options.challenge).toBeDefined();
    expect(options.rp.name).toBe('AI Career OS');
    expect(options.user.name).toBe('user@example.com');
    expect(redisStore['webauthn:challenge:register:user-uuid']).toBe(options.challenge);
  });

  it('should verify and register passkey credential', async () => {
    redisStore['webauthn:challenge:register:user-uuid'] = 'valid-challenge';

    const mockResponse = {
      id: 'mock-cred-id',
      rawId: 'mock-cred-id',
      response: {
        clientDataJSON: 'mockClientData',
        attestationObject: 'mockAttestation',
      },
      type: 'public-key',
    };

    const passkey = await service.verifyAndRegister(
      'user-uuid',
      mockResponse,
      'My Laptop',
      { ipAddress: '127.0.0.1', userAgent: 'test' },
    );

    expect(passkey.credentialId).toBe('mock-cred-id');
    expect(passkey.nickname).toBe('My Laptop');
    expect(mockPasskeyRepository.createPasskey).toHaveBeenCalled();
    expect(redisStore['webauthn:challenge:register:user-uuid']).toBeUndefined(); // cleaned
  });

  it('should generate authentication options', async () => {
    const options = await service.generateLoginOptions('user@example.com');

    expect(options.challenge).toBeDefined();
    expect(redisStore['webauthn:challenge:login:user-uuid']).toBe(options.challenge);
  });

  it('should verify authentication response and login successfully', async () => {
    redisStore['webauthn:challenge:login:user-uuid'] = 'valid-challenge';
    mockPasskeyRepository.findByCredentialId.mockResolvedValue({
      id: 'key-id',
      userId: 'user-uuid',
      credentialId: 'mock-cred-id',
      publicKey: '{"kty":"EC"}',
      counter: 10,
    });

    const mockAssertion = {
      id: 'mock-cred-id',
      rawId: 'mock-cred-id',
      response: {
        clientDataJSON: 'mockClientData',
        authenticatorData: Buffer.from([
          // Simulated authenticator data (37 bytes minimum, signCount at offset 33 is BE UInt32: e.g. 15)
          ...new Array(33).fill(0),
          0, 0, 0, 15,
        ]).toString('base64'),
        signature: 'mockSignature',
      },
      type: 'public-key',
    };

    const { user, passkey } = await service.verifyAndAuthenticate(
      'user@example.com',
      mockAssertion,
      { ipAddress: '127.0.0.1', userAgent: 'test' },
    );

    expect(user.id).toBe('user-uuid');
    expect(passkey.id).toBe('key-id');
    expect(mockPasskeyRepository.updateCounter).toHaveBeenCalledWith('key-id', 15);
    expect(redisStore['webauthn:challenge:login:user-uuid']).toBeUndefined();
  });
});
