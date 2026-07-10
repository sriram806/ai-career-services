import type { FastifyRequest, FastifyReply } from 'fastify';
import type { AuthController } from '../controllers/auth.controller';
import type { JwtService } from '../services/jwt.service';
import { ErrorFactory } from '@ai-career-os/errors';

/**
 * Registers all 15 authentication API endpoints.
 *
 * Route categories:
 *   - Public: register, login, refresh, logout, forgot-password, reset-password,
 *             verify-email, resend-verification, send-otp, verify-otp
 *   - Protected (requires valid JWT): me, change-password, sessions, sessions/:id, logout-all
 *
 * Authentication middleware:
 *   The `authenticate` pre-handler validates the JWT and attaches the decoded
 *   payload to `request.user`. It rejects expired and invalid tokens with
 *   a generic 401 to prevent token-state enumeration.
 */
export function registerAuthRoutes(
  fastify: any,
  controller: AuthController,
  jwtService: JwtService,
) {
  // ─── JWT Authentication Pre-Handler ──────────────
  const authenticate = async (request: FastifyRequest, _reply: FastifyReply) => {
    const authHeader = request.headers.authorization;
    if (!authHeader) {
      throw ErrorFactory.unauthorized('Authorization header is missing');
    }

    const [scheme, token] = authHeader.split(' ');
    if (scheme !== 'Bearer' || !token) {
      throw ErrorFactory.unauthorized('Invalid authorization header format');
    }

    try {
      const payload = jwtService.verifyAccessToken(token);
      (request as any).user = {
        userId: payload.sub,
        email: payload.email,
        roles: payload.roles || [payload.role],
        permissions: payload.permissions || [],
        sessionId: payload.sessionId,
      };
    } catch {
      throw ErrorFactory.unauthorized('Invalid or expired access token');
    }
  };

  const optionalAuthenticate = async (request: FastifyRequest, _reply: FastifyReply) => {
    const authHeader = request.headers.authorization;
    if (!authHeader) return;

    const [scheme, token] = authHeader.split(' ');
    if (scheme !== 'Bearer' || !token) return;

    try {
      const payload = jwtService.verifyAccessToken(token);
      (request as any).user = {
        userId: payload.sub,
        email: payload.email,
        roles: payload.roles || [payload.role],
        permissions: payload.permissions || [],
        sessionId: payload.sessionId,
      };
    } catch {
      // Optional authentication: ignore verification errors and stay unauthenticated
    }
  };

  // ═══════════════════════════════════════════════════
  // ─── PUBLIC ENDPOINTS ─────────────────────────────
  // ═══════════════════════════════════════════════════

  // POST /auth/register — Create a new account
  fastify.post('/auth/register', {
    schema: {
      description: 'Register a new user account',
      tags: ['auth'],
      body: {
        type: 'object',
        required: ['email', 'username', 'password', 'confirmPassword'],
        properties: {
          email: { type: 'string', format: 'email' },
          username: { type: 'string', minLength: 3, maxLength: 50 },
          password: { type: 'string', minLength: 12 },
          confirmPassword: { type: 'string' },
          fullName: { type: 'string' },
          phone: { type: 'string' },
          university: { type: 'string' },
          country: { type: 'string' },
          termsAccepted: { type: 'boolean' },
          role: { type: 'string' },
        },
      },
    },
  }, (req: any, rep: any) => controller.register(req, rep));

  // POST /auth/login — Authenticate and receive tokens
  fastify.post('/auth/login', {
    schema: {
      description: 'Authenticate user and receive JWT + refresh token',
      tags: ['auth'],
      body: {
        type: 'object',
        required: ['email', 'password'],
        properties: {
          email: { type: 'string', format: 'email' },
          password: { type: 'string' },
          rememberMe: { type: 'boolean' },
        },
      },
    },
  }, (req: any, rep: any) => controller.login(req, rep));

  // POST /auth/logout — Revoke current session
  fastify.post('/auth/logout', {
    schema: {
      description: 'Logout and revoke current session',
      tags: ['auth'],
    },
  }, (req: any, rep: any) => controller.logout(req, rep));

  // POST /auth/refresh — Rotate refresh token
  fastify.post('/auth/refresh', {
    schema: {
      description: 'Rotate refresh token and receive new access token',
      tags: ['auth'],
    },
  }, (req: any, rep: any) => controller.refresh(req, rep));

  // POST /auth/send-otp — Generate and send OTP
  fastify.post('/auth/send-otp', {
    schema: {
      description: 'Generate and send OTP verification code',
      tags: ['auth'],
      body: {
        type: 'object',
        required: ['userId', 'purpose'],
        properties: {
          userId: { type: 'string', format: 'uuid' },
          purpose: { type: 'string', enum: ['email_verification', 'password_reset', 'mfa'] },
        },
      },
    },
  }, (req: any, rep: any) => controller.sendOtp(req, rep));

  // POST /auth/verify-otp — Verify OTP code
  fastify.post('/auth/verify-otp', {
    schema: {
      description: 'Verify an OTP code',
      tags: ['auth'],
      body: {
        type: 'object',
        required: ['userId', 'code'],
        properties: {
          userId: { type: 'string', format: 'uuid' },
          code: { type: 'string', minLength: 6, maxLength: 6 },
        },
      },
    },
  }, (req: any, rep: any) => controller.verifyOtp(req, rep));

  // POST /auth/forgot-password — Request password reset token
  fastify.post('/auth/forgot-password', {
    schema: {
      description: 'Request a password reset token',
      tags: ['auth'],
      body: {
        type: 'object',
        required: ['email'],
        properties: {
          email: { type: 'string', format: 'email' },
        },
      },
    },
  }, (req: any, rep: any) => controller.forgotPassword(req, rep));

  // POST /auth/reset-password — Reset password with token
  fastify.post('/auth/reset-password', {
    schema: {
      description: 'Reset password using a valid reset token',
      tags: ['auth'],
      body: {
        type: 'object',
        required: ['token', 'passwordNew'],
        properties: {
          token: { type: 'string' },
          passwordNew: { type: 'string', minLength: 12 },
        },
      },
    },
  }, (req: any, rep: any) => controller.resetPassword(req, rep));

  // POST /auth/verify-email — Verify email with token
  fastify.post('/auth/verify-email', {
    schema: {
      description: 'Verify email address using verification token',
      tags: ['auth'],
      body: {
        type: 'object',
        required: ['token'],
        properties: {
          token: { type: 'string' },
        },
      },
    },
  }, (req: any, rep: any) => controller.verifyEmail(req, rep));

  // POST /auth/resend-verification — Resend verification email
  fastify.post('/auth/resend-verification', {
    schema: {
      description: 'Resend email verification link',
      tags: ['auth'],
      body: {
        type: 'object',
        required: ['email'],
        properties: {
          email: { type: 'string', format: 'email' },
        },
      },
    },
  }, (req: any, rep: any) => controller.resendVerification(req, rep));

  // ═══════════════════════════════════════════════════
  // ─── PROTECTED ENDPOINTS (require JWT) ────────────
  // ═══════════════════════════════════════════════════

  // POST /auth/logout-all — Logout from all devices
  fastify.post('/auth/logout-all', {
    preHandler: authenticate,
    schema: {
      description: 'Logout from all active sessions',
      tags: ['auth'],
    },
  }, (req: any, rep: any) => controller.logoutAll(req, rep));

  // POST /auth/change-password — Change password (authenticated)
  fastify.post('/auth/change-password', {
    preHandler: authenticate,
    schema: {
      description: 'Change password for authenticated user',
      tags: ['auth'],
      body: {
        type: 'object',
        required: ['passwordOld', 'passwordNew'],
        properties: {
          passwordOld: { type: 'string' },
          passwordNew: { type: 'string', minLength: 12 },
        },
      },
    },
  }, (req: any, rep: any) => controller.changePassword(req, rep));

  // GET /auth/me — Get authenticated user profile
  fastify.get('/auth/me', {
    preHandler: authenticate,
    schema: {
      description: 'Get authenticated user profile',
      tags: ['auth'],
    },
  }, (req: any, rep: any) => controller.getMe(req, rep));

  // GET /auth/sessions — List active sessions
  fastify.get('/auth/sessions', {
    preHandler: authenticate,
    schema: {
      description: 'List all active sessions for the authenticated user',
      tags: ['auth'],
    },
  }, (req: any, rep: any) => controller.getSessions(req, rep));

  // DELETE /auth/sessions/:id — Revoke a specific session
  fastify.delete('/auth/sessions/:id', {
    preHandler: authenticate,
    schema: {
      description: 'Revoke a specific session by ID',
      tags: ['auth'],
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string', format: 'uuid' },
        },
      },
    },
  }, (req: any, rep: any) => controller.revokeSession(req, rep));

  // ═══════════════════════════════════════════════════
  // ─── NEW ENTERPRISE IDENTITY & SECURITY ROUTES ────
  // ═══════════════════════════════════════════════════

  // OAuth Initiate routes
  fastify.post('/auth/oauth/google', (req: any, rep: any) => {
    req.params.provider = 'google';
    return controller.oauthInitiate(req, rep);
  });
  fastify.post('/auth/oauth/github', (req: any, rep: any) => {
    req.params.provider = 'github';
    return controller.oauthInitiate(req, rep);
  });
  fastify.post('/auth/oauth/microsoft', (req: any, rep: any) => {
    req.params.provider = 'microsoft';
    return controller.oauthInitiate(req, rep);
  });
  fastify.post('/auth/oauth/linkedin', (req: any, rep: any) => {
    req.params.provider = 'linkedin';
    return controller.oauthInitiate(req, rep);
  });

  // OAuth Callback route
  fastify.get('/auth/oauth/callback', (req: any, rep: any) => controller.oauthCallback(req, rep));

  // OAuth Unlink route
  fastify.post('/auth/oauth/unlink', { preHandler: authenticate }, (req: any, rep: any) => controller.oauthUnlink(req, rep));
  fastify.get('/auth/oauth/providers', { preHandler: authenticate }, (req: any, rep: any) => controller.getConnectedProviders(req, rep));

  // MFA routes
  fastify.post('/auth/mfa/enable', { preHandler: authenticate }, (req: any, rep: any) => controller.mfaEnable(req, rep));
  fastify.post('/auth/mfa/disable', { preHandler: authenticate }, (req: any, rep: any) => controller.mfaDisable(req, rep));
  fastify.post('/auth/mfa/verify', { preHandler: optionalAuthenticate }, (req: any, rep: any) => controller.mfaVerify(req, rep));
  fastify.post('/auth/mfa/recovery-codes/rotate', { preHandler: authenticate }, (req: any, rep: any) => controller.rotateRecoveryCodes(req, rep));

  // Passkey routes (Smart dual-mode: returns options if no body response, verifies if body response present)
  fastify.post('/auth/passkeys/register', { preHandler: authenticate }, (req: any, rep: any) => {
    if (req.body && req.body.response) {
      return controller.passkeyRegisterVerify(req, rep);
    }
    return controller.passkeyRegisterOptions(req, rep);
  });

  fastify.post('/auth/passkeys/authenticate', (req: any, rep: any) => {
    if (req.body && req.body.response) {
      return controller.passkeyLoginVerify(req, rep);
    }
    return controller.passkeyLoginOptions(req, rep);
  });

  fastify.get('/auth/passkeys', { preHandler: authenticate }, (req: any, rep: any) => controller.getPasskeys(req, rep));
  fastify.delete('/auth/passkeys/:id', { preHandler: authenticate }, (req: any, rep: any) => controller.deletePasskey(req, rep));
  fastify.patch('/auth/passkeys/:id', { preHandler: authenticate }, (req: any, rep: any) => controller.renamePasskey(req, rep));

  // Security & device management routes
  fastify.get('/auth/security/events', { preHandler: authenticate }, (req: any, rep: any) => controller.getSecurityEvents(req, rep));
  fastify.get('/auth/devices', { preHandler: authenticate }, (req: any, rep: any) => controller.getDevices(req, rep));
  fastify.delete('/auth/devices/:id', { preHandler: authenticate }, (req: any, rep: any) => controller.deleteDevice(req, rep));

  // RBAC info routes
  fastify.get('/auth/permissions', { preHandler: authenticate }, (req: any, rep: any) => controller.getPermissions(req, rep));
  fastify.get('/auth/roles', { preHandler: authenticate }, (req: any, rep: any) => controller.getRoles(req, rep));
}
