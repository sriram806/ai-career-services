import { describe, it, expect, vi, beforeEach } from 'vitest';
import { loadConfig } from '@ai-career-os/config';
import type { FastifyInstance } from 'fastify';

// Pre-load configurations for test environment
process.env.NODE_ENV = 'testing';
process.env.JWT_SECRET = 'test_jwt_secret_minimum_32_chars_long';
process.env.POSTGRES_DB = 'test_db';
process.env.REDIS_HOST = 'localhost';
loadConfig();

// Define mock databases and stores in module scope so they are accessible to hoisted vi.mock
const mockRedisStore: Record<string, string> = {};
const mockDbUsers: any[] = [];
const mockDbCredentials: any[] = [];
const mockDbSessions: any[] = [];
const mockDbRefreshTokens: any[] = [];
const mockDbOtpCodes: any[] = [];
const mockDbSecurityEvents: any[] = [];
const mockDbLoginHistory: any[] = [];

const mockRedis = {
  get: vi.fn().mockImplementation((key) => Promise.resolve(mockRedisStore[key] || null)),
  set: vi.fn().mockImplementation((key, val) => {
    mockRedisStore[key] = String(val);
    return Promise.resolve('OK');
  }),
  del: vi.fn().mockImplementation((key) => {
    delete mockRedisStore[key];
    return Promise.resolve(1);
  }),
  exists: vi.fn().mockImplementation((key) => Promise.resolve(key in mockRedisStore ? 1 : 0)),
  incr: vi.fn().mockImplementation((key) => {
    const val = Number(mockRedisStore[key] || 0) + 1;
    mockRedisStore[key] = String(val);
    return Promise.resolve(val);
  }),
  expire: vi.fn().mockResolvedValue(1),
};

const mockClient = new Proxy(mockRedis, {
  get(target, prop) {
    if (prop === 'then' || prop === 'catch' || prop === 'finally') {
      return undefined;
    }
    if (prop in target) {
      return (target as any)[prop];
    }
    // Return a resolved mock function for any dynamically defined Redis commands (like rate limit checks)
    return vi.fn().mockImplementation((...args) => {
      const callback = args[args.length - 1];
      if (typeof callback === 'function') {
        callback(null, [1, 1000]);
      }
      return Promise.resolve([1, 1000]);
    });
  },
});

const mockDbRoles: any[] = [];
const mockDbPermissions: any[] = [];
const mockDbRolePermissions: any[] = [];
const mockDbUserRoles: any[] = [];
const mockDbMfaSettings: any[] = [];
const mockDbRecoveryCodes: any[] = [];
const mockDbPasskeys: any[] = [];

function getTableName(table: any): string {
  if (!table) return '';
  if (typeof table === 'string') return table;
  return table.tableName || table[Symbol.for('drizzle:Name')] || '';
}

function makeQueryBuilder(data: any[]) {
  const queryObj = {
    where: vi.fn().mockImplementation(() => queryObj),
    orderBy: vi.fn().mockImplementation(() => queryObj),
    limit: vi.fn().mockImplementation((n) => makeQueryBuilder(data.slice(0, n))),
    returning: vi.fn().mockResolvedValue(data),
    onConflictDoNothing: vi.fn().mockResolvedValue(data),
    then: (resolve: any) => Promise.resolve(data).then(resolve),
    catch: (reject: any) => Promise.resolve(data).catch(reject),
    map: (fn: any) => data.map(fn),
    length: data.length,
  };
  return new Proxy(queryObj, {
    get(target, prop) {
      if (prop in target) {
        return (target as any)[prop];
      }
      if (typeof prop === 'string' && !isNaN(Number(prop))) {
        return data[Number(prop)];
      }
      return undefined;
    }
  });
}

const dbClient = {
  select: vi.fn().mockImplementation(() => dbClient),
  from: vi.fn().mockImplementation((table) => {
    const tableName = getTableName(table);
    let dbSource = mockDbUsers;
    if (tableName === 'credentials') dbSource = mockDbCredentials;
    else if (tableName === 'sessions') dbSource = mockDbSessions;
    else if (tableName === 'refresh_tokens') dbSource = mockDbRefreshTokens;
    else if (tableName === 'otp_codes') dbSource = mockDbOtpCodes;
    else if (tableName === 'mfa_settings') dbSource = mockDbMfaSettings;
    else if (tableName === 'recovery_codes') dbSource = mockDbRecoveryCodes;
    else if (tableName === 'passkeys') dbSource = mockDbPasskeys;
    else if (tableName === 'roles') dbSource = mockDbRoles;
    else if (tableName === 'permissions') dbSource = mockDbPermissions;
    else if (tableName === 'role_permissions') dbSource = mockDbRolePermissions;
    else if (tableName === 'user_roles') dbSource = mockDbUserRoles;
    return makeQueryBuilder(dbSource);
  }),
  insert: vi.fn().mockImplementation((table) => {
    return {
      values: vi.fn().mockImplementation((vals) => {
        const list = Array.isArray(vals) ? vals : [vals];
        const rows = list.map((val) => {
          const row = { id: crypto.randomUUID(), createdAt: new Date(), updatedAt: new Date(), ...val };
          const tableName = getTableName(table);
          if (tableName === 'users') mockDbUsers.push(row);
          else if (tableName === 'credentials') mockDbCredentials.push(row);
          else if (tableName === 'sessions') mockDbSessions.push(row);
          else if (tableName === 'refresh_tokens') mockDbRefreshTokens.push(row);
          else if (tableName === 'otp_codes') mockDbOtpCodes.push(row);
          else if (tableName === 'security_events') mockDbSecurityEvents.push(row);
          else if (tableName === 'login_history') mockDbLoginHistory.push(row);
          else if (tableName === 'mfa_settings') mockDbMfaSettings.push(row);
          else if (tableName === 'recovery_codes') mockDbRecoveryCodes.push(row);
          else if (tableName === 'passkeys') mockDbPasskeys.push(row);
          else if (tableName === 'roles') mockDbRoles.push(row);
          else if (tableName === 'permissions') mockDbPermissions.push(row);
          else if (tableName === 'role_permissions') mockDbRolePermissions.push(row);
          else if (tableName === 'user_roles') mockDbUserRoles.push(row);
          return row;
        });
        return {
          returning: vi.fn().mockResolvedValue(rows),
          onConflictDoNothing: vi.fn().mockResolvedValue(rows),
        };
      }),
    };
  }),
  update: vi.fn().mockImplementation(() => {
    return {
      set: vi.fn().mockReturnThis(),
      where: vi.fn().mockImplementation(() => {
        return {
          returning: vi.fn().mockResolvedValue([{ id: 'updated-id' }]),
        };
      }),
    };
  }),
  delete: vi.fn().mockImplementation(() => {
    return {
      where: vi.fn().mockResolvedValue(undefined),
    };
  }),
};

vi.mock('@ai-career-os/database', async (importOriginal) => {
  const original: any = await importOriginal();
  return {
    ...original,
    PostgresConnection: vi.fn().mockImplementation(() => {
      return {
        connect: vi.fn().mockResolvedValue(dbClient),
        disconnect: vi.fn().mockResolvedValue(undefined),
      };
    }),
    RedisConnection: vi.fn().mockImplementation(() => {
      return {
        connect: vi.fn().mockResolvedValue(mockClient),
        disconnect: vi.fn().mockResolvedValue(undefined),
      };
    }),
  };
});

import { buildApp } from '../../src/app';

describe('Auth Service Integration Tests', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    // Clear databases/stores
    for (const key of Object.keys(mockRedisStore)) {
      delete mockRedisStore[key];
    }
    mockDbUsers.length = 0;
    mockDbCredentials.length = 0;
    mockDbSessions.length = 0;
    mockDbRefreshTokens.length = 0;
    mockDbOtpCodes.length = 0;
    mockDbSecurityEvents.length = 0;
    mockDbLoginHistory.length = 0;
    mockDbRoles.length = 0;
    mockDbPermissions.length = 0;
    mockDbRolePermissions.length = 0;
    mockDbUserRoles.length = 0;

    // Pre-seed roles to avoid asynchronous startup race conditions
    mockDbRoles.push(
      { id: 'role-candidate-uuid', name: 'candidate', description: 'Candidate' },
      { id: 'role-mentor-uuid', name: 'mentor', description: 'Mentor' },
      { id: 'role-recruiter-uuid', name: 'recruiter', description: 'Recruiter' },
    );

    const { createLogger } = await import('@ai-career-os/logger');
    const logger = createLogger('auth-test', { level: 'silent' });

    app = await buildApp(logger);
  });

  it('should register a new user successfully and return pending OTP in development', async () => {
    // 1. Stub find methods to return null (clean database)
    const findEmailSpy = vi.spyOn((app as any).userRepository, 'findByEmail').mockResolvedValue(null);
    const findUsernameSpy = vi.spyOn((app as any).userRepository, 'findByUsername').mockResolvedValue(null);

    const response = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: {
        email: 'register-test@example.com',
        username: 'test_integrator',
        password: 'Password123!',
        confirmPassword: 'Password123!',
        role: 'candidate',
      },
    });

    expect(response.statusCode).toBe(201);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
    expect(body.data.message).toContain('Registration successful');
    expect(body.data.verificationToken).toBeDefined();

    findEmailSpy.mockRestore();
    findUsernameSpy.mockRestore();
  });

  it('should successfully login an active user and return access/refresh tokens', async () => {
    const mockUser = {
      id: 'user-login-uuid',
      email: 'login-test@example.com',
      username: 'login_test',
      status: 'active',
      emailVerified: true,
      phoneVerified: false,
      role: 'candidate',
      createdAt: new Date(),
      updatedAt: new Date(),
      lastLogin: null,
      deletedAt: null,
    };

    const mockCreds = {
      id: 'cred-uuid',
      userId: mockUser.id,
      passwordHash: await (app as any).authService.passwordService.hashPassword('Password123!'),
      mfaSecret: null,
      mfaEnabled: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // Stub repositories database responses
    vi.spyOn((app as any).userRepository, 'findByEmail').mockResolvedValue(mockUser);
    vi.spyOn((app as any).userRepository, 'getCredentialsByUserId').mockResolvedValue(mockCreds);
    vi.spyOn((app as any).userRepository, 'updateUser').mockResolvedValue(mockUser);

    const response = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: {
        email: 'login-test@example.com',
        password: 'Password123!',
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
    expect(body.data.accessToken).toBeDefined();

    // Verify secure cookie was injected
    const cookies = response.cookies;
    const refreshCookie = cookies.find((c) => c.name === 'refreshToken');
    expect(refreshCookie).toBeDefined();
    expect(refreshCookie?.httpOnly).toBe(true);
  });

  it('should reject login for inactive accounts pending email verification', async () => {
    const mockUser = {
      id: 'user-pending-uuid',
      email: 'pending-test@example.com',
      username: 'pending_test',
      status: 'pending_verification',
      emailVerified: false,
      phoneVerified: false,
      role: 'candidate',
      createdAt: new Date(),
      updatedAt: new Date(),
      lastLogin: null,
      deletedAt: null,
    };

    const mockCreds = {
      id: 'cred-uuid',
      userId: mockUser.id,
      passwordHash: await (app as any).authService.passwordService.hashPassword('Password123!'),
      mfaSecret: null,
      mfaEnabled: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    vi.spyOn((app as any).userRepository, 'findByEmail').mockResolvedValue(mockUser);
    vi.spyOn((app as any).userRepository, 'getCredentialsByUserId').mockResolvedValue(mockCreds);

    const response = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: {
        email: 'pending-test@example.com',
        password: 'Password123!',
      },
    });

    expect(response.statusCode).toBe(403);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(false);
    expect(body.error.message).toContain('Please verify your email address before logging in.');
  });

  it('should fetch user context profile details for authenticated requests on /auth/me', async () => {
    const mockUser = {
      id: 'user-me-uuid',
      email: 'me-test@example.com',
      username: 'me_test',
      status: 'active',
      emailVerified: true,
      phoneVerified: false,
      role: 'candidate',
      createdAt: new Date(),
      updatedAt: new Date(),
      lastLogin: new Date(),
      deletedAt: null,
    };

    vi.spyOn((app as any).userRepository, 'findById').mockResolvedValue(mockUser);

    // Generate access token for the request
    const token = (app as any).jwtService.generateAccessToken({
      userId: mockUser.id,
      email: mockUser.email,
      role: mockUser.role,
      sessionId: 'session-uuid',
    });

    const response = await app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: {
        authorization: `Bearer ${token}`,
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
    expect(body.data.user.email).toBe(mockUser.email);
    expect(body.data.user.username).toBe(mockUser.username);
  });

  // ═══════════════════════════════════════════════════
  // ─── ENTERPRISE INTEGRATION TESTS ─────────────────
  // ═══════════════════════════════════════════════════

  it('should successfully initiate Google OAuth flow', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/auth/oauth/google',
      payload: {
        redirectUri: 'http://localhost:3000/auth/oauth/callback',
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
    expect(body.data.authorizationUrl).toContain('accounts.google.com');
  });

  it('should process OAuth callback and redirect to success landing', async () => {
    const state = 'test_oauth_state';
    mockRedisStore[`oauth:flow:${state}`] = JSON.stringify({
      provider: 'google',
      nonce: 'nonce123',
      codeVerifier: 'verifier123',
      redirectUri: 'http://localhost:3000/auth/oauth/callback',
    });

    const response = await app.inject({
      method: 'GET',
      url: `/auth/oauth/callback?code=test_code_12345&state=${state}`,
    });

    expect(response.statusCode).toBe(302);
    expect(response.headers.location).toContain('/success?type=login-success');
    expect(response.headers.location).toContain('accessToken=');
  });

  it('should initiate and enable TOTP MFA settings for active user', async () => {
    const mockUser = {
      id: 'user-mfa-uuid',
      email: 'mfa-init@example.com',
      username: 'mfa_user',
      role: 'candidate',
    };
    const token = (app as any).jwtService.generateAccessToken({
      userId: mockUser.id,
      email: mockUser.email,
      role: mockUser.role,
      sessionId: 'session-uuid',
    });

    vi.spyOn((app as any).userRepository, 'findById').mockResolvedValue(mockUser);

    const initiateRes = await app.inject({
      method: 'POST',
      url: '/auth/mfa/enable',
      headers: { authorization: `Bearer ${token}` },
      payload: { type: 'totp' },
    });

    expect(initiateRes.statusCode).toBe(200);
    const body1 = JSON.parse(initiateRes.body);
    expect(body1.data.secret).toBeDefined();

    vi.spyOn((app as any).mfaService, 'verifyAndEnableTotp').mockResolvedValue(['CODE-1', 'CODE-2']);

    const verifyRes = await app.inject({
      method: 'POST',
      url: '/auth/mfa/verify',
      headers: { authorization: `Bearer ${token}` },
      payload: { code: '123456' },
    });

    expect(verifyRes.statusCode).toBe(200);
    const body2 = JSON.parse(verifyRes.body);
    expect(body2.data.recoveryCodes).toEqual(['CODE-1', 'CODE-2']);
  });

  it('should fetch security logs and active devices for user', async () => {
    const userId = 'user-devices-uuid';
    const token = (app as any).jwtService.generateAccessToken({
      userId,
      email: 'devices@example.com',
      role: 'candidate',
      sessionId: 'session-uuid',
    });

    const response = await app.inject({
      method: 'GET',
      url: '/auth/devices',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.data.sessions).toBeDefined();
    expect(body.data.trustedDevices).toBeDefined();
  });
});
