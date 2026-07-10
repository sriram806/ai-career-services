import type { FastifyRequest, FastifyReply } from 'fastify';
import { createSuccessResponse } from '@ai-career-os/common';
import type { AuthService } from '../services/auth.service';
import type { EmailVerificationService } from '../services/email-verification.service';
import type { PasswordResetService } from '../services/password-reset.service';
import type { OtpService } from '../services/otp.service';
import type { SessionService } from '../services/session.service';
import type { TrustedDeviceService } from '../services/trusted-device.service';
import type { MfaService } from '../services/mfa.service';
import type { PasskeyService } from '../services/passkey.service';
import type { RbacService } from '../services/rbac.service';
import type { OAuthService } from '../services/oauth.service';
import type { AuditRepository } from '../repositories/audit.repository';
import type { SessionRepository } from '../repositories/session.repository';
import type { UserRepository } from '../repositories/user.repository';
import { validate } from '@ai-career-os/validation';
import {
  registerSchema,
  loginSchema,
  otpVerifySchema,
  otpRequestSchema,
  changePasswordSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  verifyEmailSchema,
  resendVerificationSchema,
  mfaEnableSchema,
  mfaVerifySchema,
  mfaDisableSchema,
  passkeyRenameSchema,
  oauthInitiateSchema,
  oauthUnlinkSchema,
} from '../validators/auth.validator';
import { ErrorFactory } from '@ai-career-os/errors';
import { getConfig } from '@ai-career-os/config';

/**
 * HTTP controller for all authentication endpoints.
 *
 * Responsibilities:
 *   - Request validation (delegates to Zod schemas)
 *   - HTTP context extraction (IP, User-Agent, cookies)
 *   - Response formatting (delegates to createSuccessResponse)
 *   - Cookie management (refresh token in HTTP-only secure cookie)
 *
 * All business logic lives in the service layer — the controller is a thin adapter.
 */
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly emailVerificationService: EmailVerificationService,
    private readonly passwordResetService: PasswordResetService,
    private readonly otpService: OtpService,
    private readonly sessionService: SessionService,
    private readonly trustedDeviceService: TrustedDeviceService,
    private readonly mfaService: MfaService,
    private readonly passkeyService: PasskeyService,
    private readonly rbacService: RbacService,
    private readonly oauthService: OAuthService,
    private readonly auditRepository: AuditRepository,
    private readonly sessionRepository: SessionRepository,
    private readonly userRepository: UserRepository,
  ) {}

  // ─── Helper: extract request context ─────────────
  private getContext(request: FastifyRequest) {
    return {
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'] || null,
    };
  }

  // ─── Helper: get authenticated user from JWT context ─
  private getAuthUser(request: FastifyRequest): { userId: string; email: string; sessionId: string } {
    const user = (request as any).user;
    if (!user?.userId) {
      throw ErrorFactory.unauthorized('Authentication required');
    }
    return user;
  }

  // ─── Helper: set refresh token cookie ────────────
  private setRefreshTokenCookie(reply: FastifyReply, token: string): void {
    reply.setCookie('refreshToken', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/auth',
      maxAge: 30 * 24 * 60 * 60, // 30 days
    });
  }

  // ─── Helper: clear refresh token cookie ──────────
  private clearRefreshTokenCookie(reply: FastifyReply): void {
    reply.clearCookie('refreshToken', { path: '/auth' });
  }

  // ─── Helper: extract refresh token from cookie or body ─
  private getRefreshToken(request: FastifyRequest): string | null {
    return request.cookies['refreshToken'] || (request.body as any)?.refreshToken || null;
  }

  // ═══════════════════════════════════════════════════
  // ─── POST /auth/register ──────────────────────────
  // ═══════════════════════════════════════════════════

  async register(request: FastifyRequest, reply: FastifyReply) {
    const data = validate(registerSchema, request.body);
    const ctx = this.getContext(request);

    const { user } = await this.authService.register({
      email: data.email,
      username: data.username,
      password: data.password,
      fullName: data.fullName,
      phone: data.phone,
      university: data.university,
      country: data.country,
      termsAccepted: data.termsAccepted,
      role: data.role || 'candidate',
      ...ctx,
    });

    // Generate email verification OTP code
    const otpCode = await this.otpService.generateOtp(user.id, 'email_verification');

    return reply.status(201).send(
      createSuccessResponse(
        {
          message: 'Registration successful. Please verify your email address.',
          userId: user.id,
          email: user.email,
          // Return verification code in non-production for testing
          verificationCode: process.env.NODE_ENV !== 'production' ? otpCode : undefined,
        },
        request.id,
      ),
    );
  }

  // ═══════════════════════════════════════════════════
  // ─── POST /auth/login ─────────────────────────────
  // ═══════════════════════════════════════════════════

  async login(request: FastifyRequest, reply: FastifyReply) {
    const data = validate(loginSchema, request.body);
    const ctx = this.getContext(request);

    const result = await this.authService.login({
      email: data.email,
      password: data.password,
      rememberMe: data.rememberMe,
      ...ctx,
    });

    this.setRefreshTokenCookie(reply, result.refreshToken);

    return reply.status(200).send(
      createSuccessResponse(
        {
          accessToken: result.accessToken,
          user: result.user,
        },
        request.id,
      ),
    );
  }

  // ═══════════════════════════════════════════════════
  // ─── POST /auth/logout ────────────────────────────
  // ═══════════════════════════════════════════════════

  async logout(request: FastifyRequest, reply: FastifyReply) {
    const refreshToken = this.getRefreshToken(request);
    const ctx = this.getContext(request);

    if (refreshToken) {
      await this.authService.logout({ refreshToken, ...ctx });
    }

    this.clearRefreshTokenCookie(reply);

    return reply.status(200).send(
      createSuccessResponse(
        { message: 'Successfully logged out' },
        request.id,
      ),
    );
  }

  // ═══════════════════════════════════════════════════
  // ─── POST /auth/logout-all ────────────────────────
  // ═══════════════════════════════════════════════════

  async logoutAll(request: FastifyRequest, reply: FastifyReply) {
    const { userId } = this.getAuthUser(request);
    const ctx = this.getContext(request);

    await this.authService.logoutAll(userId, ctx);
    this.clearRefreshTokenCookie(reply);

    return reply.status(200).send(
      createSuccessResponse(
        { message: 'Successfully logged out from all devices' },
        request.id,
      ),
    );
  }

  // ═══════════════════════════════════════════════════
  // ─── POST /auth/refresh ───────────────────────────
  // ═══════════════════════════════════════════════════

  async refresh(request: FastifyRequest, reply: FastifyReply) {
    const refreshToken = this.getRefreshToken(request);
    if (!refreshToken) {
      throw ErrorFactory.unauthorized('Refresh token is missing');
    }

    const ctx = this.getContext(request);
    const result = await this.authService.refresh({ refreshToken, ...ctx });

    this.setRefreshTokenCookie(reply, result.refreshToken);

    return reply.status(200).send(
      createSuccessResponse(
        { accessToken: result.accessToken },
        request.id,
      ),
    );
  }

  // ═══════════════════════════════════════════════════
  // ─── POST /auth/send-otp ─────────────────────────
  // ═══════════════════════════════════════════════════

  async sendOtp(request: FastifyRequest, reply: FastifyReply) {
    const data = validate(otpRequestSchema, request.body);

    const code = await this.otpService.generateOtp(data.userId, data.purpose);

    return reply.status(200).send(
      createSuccessResponse(
        {
          message: `Verification code sent successfully for ${data.purpose}.`,
          // Return OTP in non-production for testing
          verificationCode: process.env.NODE_ENV !== 'production' ? code : undefined,
        },
        request.id,
      ),
    );
  }

  // ═══════════════════════════════════════════════════
  // ─── POST /auth/verify-otp ────────────────────────
  // ═══════════════════════════════════════════════════

  async verifyOtp(request: FastifyRequest, reply: FastifyReply) {
    const data = validate(otpVerifySchema, request.body);

    const isValid = await this.otpService.verifyOtp(data.userId, 'email_verification', data.code);
    if (!isValid) {
      throw ErrorFactory.badRequest('Invalid verification code');
    }

    // Activate user account upon successful email verification OTP
    await this.userRepository.updateUser(data.userId, {
      status: 'active',
      emailVerified: true,
    });

    return reply.status(200).send(
      createSuccessResponse(
        { message: 'Verification successful.' },
        request.id,
      ),
    );
  }

  // ═══════════════════════════════════════════════════
  // ─── POST /auth/forgot-password ───────────────────
  // ═══════════════════════════════════════════════════

  async forgotPassword(request: FastifyRequest, reply: FastifyReply) {
    const data = validate(forgotPasswordSchema, request.body);
    const ctx = this.getContext(request);

    const resetToken = await this.passwordResetService.generateResetToken(data.email, ctx);

    return reply.status(200).send(
      createSuccessResponse(
        {
          message: 'If the email matches an account, a password reset link has been sent.',
          // Return token in non-production for testing
          resetToken: process.env.NODE_ENV !== 'production' ? resetToken : undefined,
        },
        request.id,
      ),
    );
  }

  // ═══════════════════════════════════════════════════
  // ─── POST /auth/reset-password ────────────────────
  // ═══════════════════════════════════════════════════

  async resetPassword(request: FastifyRequest, reply: FastifyReply) {
    const data = validate(resetPasswordSchema, request.body);
    const ctx = this.getContext(request);

    await this.passwordResetService.resetPassword(data.token, data.passwordNew, ctx);

    return reply.status(200).send(
      createSuccessResponse(
        { message: 'Password has been reset successfully. All active sessions have been revoked.' },
        request.id,
      ),
    );
  }

  // ═══════════════════════════════════════════════════
  // ─── POST /auth/change-password ───────────────────
  // ═══════════════════════════════════════════════════

  async changePassword(request: FastifyRequest, reply: FastifyReply) {
    const { userId, sessionId } = this.getAuthUser(request);
    const data = validate(changePasswordSchema, request.body);
    const ctx = this.getContext(request);

    await this.authService.changePassword({
      userId,
      passwordOld: data.passwordOld,
      passwordNew: data.passwordNew,
      currentSessionId: sessionId,
      ...ctx,
    });

    return reply.status(200).send(
      createSuccessResponse(
        { message: 'Password updated successfully. Other sessions have been revoked.' },
        request.id,
      ),
    );
  }

  // ═══════════════════════════════════════════════════
  // ─── GET /auth/me ─────────────────────────────────
  // ═══════════════════════════════════════════════════

  async getMe(request: FastifyRequest, reply: FastifyReply) {
    const { userId } = this.getAuthUser(request);
    const user = await this.authService.getMe(userId);

    return reply.status(200).send(
      createSuccessResponse({ user }, request.id),
    );
  }

  // ═══════════════════════════════════════════════════
  // ─── GET /auth/sessions ───────────────────────────
  // ═══════════════════════════════════════════════════

  async getSessions(request: FastifyRequest, reply: FastifyReply) {
    const { userId } = this.getAuthUser(request);
    const sessions = await this.sessionService.getActiveSessions(userId);

    return reply.status(200).send(
      createSuccessResponse({ sessions }, request.id),
    );
  }

  // ═══════════════════════════════════════════════════
  // ─── DELETE /auth/sessions/:id ────────────────────
  // ═══════════════════════════════════════════════════

  async revokeSession(request: FastifyRequest, reply: FastifyReply) {
    const { userId } = this.getAuthUser(request);
    const { id: sessionId } = request.params as { id: string };

    if (!sessionId) {
      throw ErrorFactory.badRequest('Session ID is required');
    }

    // Verify the session belongs to the authenticated user
    const sessions = await this.sessionService.getActiveSessions(userId);
    const targetSession = sessions.find((s) => s.id === sessionId);
    if (!targetSession) {
      throw ErrorFactory.notFound('Session');
    }

    await this.sessionService.revokeSession(sessionId);

    return reply.status(200).send(
      createSuccessResponse(
        { message: 'Session revoked successfully' },
        request.id,
      ),
    );
  }

  // ═══════════════════════════════════════════════════
  // ─── POST /auth/verify-email ──────────────────────
  // ═══════════════════════════════════════════════════

  async verifyEmail(request: FastifyRequest, reply: FastifyReply) {
    const data = validate(verifyEmailSchema, request.body);
    const ctx = this.getContext(request);

    await this.emailVerificationService.verifyToken(data.token, ctx);

    return reply.status(200).send(
      createSuccessResponse(
        { message: 'Email verified successfully. You can now log in.' },
        request.id,
      ),
    );
  }

  // ═══════════════════════════════════════════════════
  // ─── POST /auth/resend-verification ───────────────
  // ═══════════════════════════════════════════════════

  async resendVerification(request: FastifyRequest, reply: FastifyReply) {
    const data = validate(resendVerificationSchema, request.body);

    // Look up user by email — generic message prevents enumeration
    const user = await this.authService.getMe(data.email).catch(() => null);

    // We always return the same message regardless of whether email exists
    // to prevent email enumeration attacks
    let verificationCode: string | undefined;
    if (user) {
      try {
        if (user.emailVerified) {
          throw ErrorFactory.badRequest('Email is already verified');
        }
        verificationCode = await this.otpService.generateOtp((user as any).id, 'email_verification');
      } catch {
        // Swallow errors (cooldown, already verified) — return generic message
      }
    }

    return reply.status(200).send(
      createSuccessResponse(
        {
          message: 'If the email matches an unverified account, a new verification email has been sent.',
          verificationCode: process.env.NODE_ENV !== 'production' ? verificationCode : undefined,
        },
        request.id,
      ),
    );
  }

  // ═══════════════════════════════════════════════════
  // ─── OAUTH ENDPOINTS ──────────────────────────────
  // ═══════════════════════════════════════════════════

  async oauthInitiate(request: FastifyRequest, reply: FastifyReply) {
    const { provider } = request.params as { provider: string };
    const query = validate(oauthInitiateSchema, request.query);

    const config = getConfig();
    const defaultCallback = `${config.CORS_ORIGIN}/auth/oauth/callback`;
    const redirectUri = query.redirectUri || defaultCallback;

    const { authorizationUrl } = await this.oauthService.initiateFlow(provider, redirectUri);

    return reply.status(200).send(
      createSuccessResponse(
        { authorizationUrl },
        request.id,
      ),
    );
  }

  async oauthCallback(request: FastifyRequest, reply: FastifyReply) {
    const { code, state } = request.query as { code: string; state: string };
    if (!code || !state) {
      throw ErrorFactory.badRequest('OAuth authorization code and state are required');
    }

    const ctx = this.getContext(request);
    const result = await this.oauthService.handleCallback(code, state, ctx);

    this.setRefreshTokenCookie(reply, result.refreshToken);

    const config = getConfig();
    const redirectUrl = `${config.CORS_ORIGIN}/success?type=login-success&accessToken=${result.accessToken}&refreshToken=${result.refreshToken}&user=${encodeURIComponent(JSON.stringify(result.user))}`;

    return reply.redirect(redirectUrl);
  }

  async oauthUnlink(request: FastifyRequest, reply: FastifyReply) {
    const { userId } = this.getAuthUser(request);
    const { provider } = validate(oauthUnlinkSchema, request.body);

    await this.oauthService.unlinkProvider(userId, provider);

    return reply.status(200).send(
      createSuccessResponse(
        { message: `Successfully unlinked ${provider} account` },
        request.id,
      ),
    );
  }

  async getConnectedProviders(request: FastifyRequest, reply: FastifyReply) {
    const { userId } = this.getAuthUser(request);
    const providers = await this.oauthService.getConnectedProviders(userId);

    return reply.status(200).send(
      createSuccessResponse(
        { providers },
        request.id,
      ),
    );
  }

  // ═══════════════════════════════════════════════════
  // ─── MFA ENDPOINTS ────────────────────────────────
  // ═══════════════════════════════════════════════════

  async mfaEnable(request: FastifyRequest, reply: FastifyReply) {
    const { userId, email } = this.getAuthUser(request);
    const data = validate(mfaEnableSchema, request.body);
    const ctx = this.getContext(request);

    if (data.type === 'totp') {
      const setup = await this.mfaService.initiateTotpSetup(userId, email);
      return reply.status(200).send(
        createSuccessResponse(
          setup,
          request.id,
        ),
      );
    } else {
      const recoveryCodes = await this.mfaService.enableEmailMfa(userId, ctx);
      return reply.status(200).send(
        createSuccessResponse(
          { message: 'Email MFA enabled successfully', recoveryCodes },
          request.id,
        ),
      );
    }
  }

  async mfaVerify(request: FastifyRequest, reply: FastifyReply) {
    const data = validate(mfaVerifySchema, request.body);
    const ctx = this.getContext(request);

    if (data.tempToken) {
      // 1. Login flow verification
      const tempSessionDataStr = await this.authService.redisClient.get(`mfa:login:temp:${data.tempToken}`);
      if (!tempSessionDataStr) {
        throw ErrorFactory.unauthorized('MFA verification session expired or invalid');
      }

      const tempSessionData = JSON.parse(tempSessionDataStr);
      const isCodeValid = await this.mfaService.verifyMfaToken(tempSessionData.userId, data.code);
      if (!isCodeValid) {
        throw ErrorFactory.unauthorized('Invalid MFA verification or recovery code');
      }

      // Successful verification -> create actual session
      await this.authService.redisClient.del(`mfa:login:temp:${data.tempToken}`);

      const plainRefreshToken = this.authService.jwtService.generateRefreshToken();
      const tokenHash = this.authService.jwtService.hashToken(plainRefreshToken);

      const session = await this.authService.sessionService.createSession({
        userId: tempSessionData.userId,
        userAgent: tempSessionData.userAgent,
        ipAddress: tempSessionData.ipAddress,
        refreshTokenHash: tokenHash,
      });

      await this.authService.refreshTokenRepository.createRefreshToken({
        userId: tempSessionData.userId,
        sessionId: session.id,
        tokenHash,
        parentTokenHash: null,
        expiresAt: session.expiresAt,
      });

      const user = await this.userRepository.findById(tempSessionData.userId);
      const roles = await this.rbacService.getUserRoles(tempSessionData.userId);
      const permissions = await this.rbacService.getUserPermissions(tempSessionData.userId);

      const accessToken = this.authService.jwtService.generateAccessToken({
        userId: tempSessionData.userId,
        email: user!.email,
        role: user!.role,
        roles,
        permissions,
        sessionId: session.id,
      });

      this.setRefreshTokenCookie(reply, plainRefreshToken);

      await this.auditRepository.createSecurityEvent({
        userId: tempSessionData.userId,
        eventType: 'user.login.mfa.success',
        ipAddress: tempSessionData.ipAddress,
        userAgent: tempSessionData.userAgent,
        details: { sessionId: session.id },
      });

      return reply.status(200).send(
        createSuccessResponse(
          {
            accessToken,
            user: {
              id: user!.id,
              email: user!.email,
              username: user!.username,
              fullName: user!.fullName,
              role: user!.role,
            },
          },
          request.id,
        ),
      );
    } else {
      // 2. Setup verification phase (user must be authenticated)
      const { userId } = this.getAuthUser(request);
      const recoveryCodes = await this.mfaService.verifyAndEnableTotp(userId, data.code, ctx);

      return reply.status(200).send(
        createSuccessResponse(
          { message: 'MFA setup verified and enabled successfully', recoveryCodes },
          request.id,
        ),
      );
    }
  }

  async mfaDisable(request: FastifyRequest, reply: FastifyReply) {
    const { userId } = this.getAuthUser(request);
    const data = validate(mfaDisableSchema, request.body);
    const ctx = this.getContext(request);

    await this.mfaService.disableMfa(userId, data.code, ctx);

    return reply.status(200).send(
      createSuccessResponse(
        { message: 'MFA successfully disabled' },
        request.id,
      ),
    );
  }

  async rotateRecoveryCodes(request: FastifyRequest, reply: FastifyReply) {
    const { userId } = this.getAuthUser(request);
    const { code } = request.body as { code: string };
    if (!code) {
      throw ErrorFactory.badRequest('Verification code or recovery code is required');
    }
    const ctx = this.getContext(request);

    const recoveryCodes = await this.mfaService.rotateRecoveryCodes(userId, code, ctx);

    return reply.status(200).send(
      createSuccessResponse(
        { recoveryCodes },
        request.id,
      ),
    );
  }

  // ═══════════════════════════════════════════════════
  // ─── WEBAUTHN / PASSKEY ENDPOINTS ─────────────────
  // ═══════════════════════════════════════════════════

  async passkeyRegisterOptions(request: FastifyRequest, reply: FastifyReply) {
    const { userId, email } = this.getAuthUser(request);
    const options = await this.passkeyService.generateRegisterOptions(userId, email);

    return reply.status(200).send(
      createSuccessResponse(
        options,
        request.id,
      ),
    );
  }

  async passkeyRegisterVerify(request: FastifyRequest, reply: FastifyReply) {
    const { userId } = this.getAuthUser(request);
    const body = request.body as any;
    const nickname = body.nickname || 'My Passkey';
    const ctx = this.getContext(request);

    await this.passkeyService.verifyAndRegister(userId, body, nickname, ctx);

    return reply.status(200).send(
      createSuccessResponse(
        { message: 'Passkey registered successfully' },
        request.id,
      ),
    );
  }

  async passkeyLoginOptions(request: FastifyRequest, reply: FastifyReply) {
    const { email } = request.query as { email: string };
    if (!email) {
      throw ErrorFactory.badRequest('Email is required');
    }

    const options = await this.passkeyService.generateLoginOptions(email);

    return reply.status(200).send(
      createSuccessResponse(
        options,
        request.id,
      ),
    );
  }

  async passkeyLoginVerify(request: FastifyRequest, reply: FastifyReply) {
    const body = request.body as any;
    const email = body.email;
    if (!email) {
      throw ErrorFactory.badRequest('Email is required');
    }
    const ctx = this.getContext(request);

    const { user } = await this.passkeyService.verifyAndAuthenticate(email, body, ctx);

    const plainRefreshToken = this.authService.jwtService.generateRefreshToken();
    const tokenHash = this.authService.jwtService.hashToken(plainRefreshToken);

    const session = await this.authService.sessionService.createSession({
      userId: user.id,
      userAgent: ctx.userAgent,
      ipAddress: ctx.ipAddress,
      refreshTokenHash: tokenHash,
    });

    await this.authService.refreshTokenRepository.createRefreshToken({
      userId: user.id,
      sessionId: session.id,
      tokenHash,
      parentTokenHash: null,
      expiresAt: session.expiresAt,
    });

    const roles = await this.rbacService.getUserRoles(user.id);
    const permissions = await this.rbacService.getUserPermissions(user.id);

    const accessToken = this.authService.jwtService.generateAccessToken({
      userId: user.id,
      email: user.email,
      role: user.role,
      roles,
      permissions,
      sessionId: session.id,
    });

    this.setRefreshTokenCookie(reply, plainRefreshToken);

    return reply.status(200).send(
      createSuccessResponse(
        {
          accessToken,
          user: {
            id: user.id,
            email: user.email,
            username: user.username,
            fullName: user.fullName,
            role: user.role,
          },
        },
        request.id,
      ),
    );
  }

  async getPasskeys(request: FastifyRequest, reply: FastifyReply) {
    const { userId } = this.getAuthUser(request);
    const passkeys = await this.passkeyService.getPasskeysForUser(userId);

    return reply.status(200).send(
      createSuccessResponse(
        { passkeys },
        request.id,
      ),
    );
  }

  async renamePasskey(request: FastifyRequest, reply: FastifyReply) {
    const { userId } = this.getAuthUser(request);
    const { id } = request.params as { id: string };
    const { nickname } = validate(passkeyRenameSchema, request.body);

    await this.passkeyService.renamePasskey(id, userId, nickname);

    return reply.status(200).send(
      createSuccessResponse(
        { message: 'Passkey renamed successfully' },
        request.id,
      ),
    );
  }

  async deletePasskey(request: FastifyRequest, reply: FastifyReply) {
    const { userId } = this.getAuthUser(request);
    const { id } = request.params as { id: string };
    const ctx = this.getContext(request);

    await this.passkeyService.deletePasskey(id, userId, ctx);

    return reply.status(200).send(
      createSuccessResponse(
        { message: 'Passkey deleted successfully' },
        request.id,
      ),
    );
  }

  // ═══════════════════════════════════════════════════
  // ─── SECURITY & AUDIT ENDPOINTS ───────────────────
  // ═══════════════════════════════════════════════════

  async getSecurityEvents(request: FastifyRequest, reply: FastifyReply) {
    const { userId } = this.getAuthUser(request);
    const events = await this.auditRepository.findSecurityEventsForUser(userId);

    return reply.status(200).send(
      createSuccessResponse(
        { events },
        request.id,
      ),
    );
  }

  async getDevices(request: FastifyRequest, reply: FastifyReply) {
    const { userId } = this.getAuthUser(request);
    const activeSessions = await this.sessionRepository.findActiveSessionsByUserId(userId);
    const trusted = await this.trustedDeviceService.trustedDeviceRepository.findAllForUser(userId);

    return reply.status(200).send(
      createSuccessResponse(
        {
          sessions: activeSessions.map((s) => ({
            id: s.id,
            ipAddress: s.ipAddress,
            browser: s.browser,
            os: s.os,
            location: s.location,
            lastActive: s.lastActivityAt,
            createdAt: s.createdAt,
          })),
          trustedDevices: trusted.map((t) => ({
            id: t.id,
            nickname: t.deviceNickname || t.deviceName,
            ipAddress: t.ipAddress,
            browser: t.browser,
            os: t.os,
            lastActive: t.lastActiveAt || t.lastUsedAt,
            createdAt: t.createdAt,
          })),
        },
        request.id,
      ),
    );
  }

  async deleteDevice(request: FastifyRequest, reply: FastifyReply) {
    const { userId } = this.getAuthUser(request);
    const { id } = request.params as { id: string };

    // Try revoking as session first, then as trusted device
    const activeSessions = await this.sessionRepository.findActiveSessionsByUserId(userId);
    const sessionMatch = activeSessions.find((s) => s.id === id);

    if (sessionMatch) {
      await this.sessionService.revokeSession(id);
    } else {
      const trusted = await this.trustedDeviceService.trustedDeviceRepository.findAllForUser(userId);
      const trustedMatch = trusted.find((t) => t.id === id);
      if (!trustedMatch) {
        throw ErrorFactory.notFound('Session or Trusted Device');
      }
      await this.trustedDeviceService.trustedDeviceRepository.deleteDevice(id);

      // Audit
      await this.auditRepository.createSecurityEvent({
        userId,
        eventType: 'device.removed',
        details: { deviceId: id, nickname: trustedMatch.deviceNickname || trustedMatch.deviceName },
      });
    }

    return reply.status(200).send(
      createSuccessResponse(
        { message: 'Device/Session successfully revoked' },
        request.id,
      ),
    );
  }

  async getPermissions(request: FastifyRequest, reply: FastifyReply) {
    const permissions = await this.rbacService.getPermissions();
    return reply.status(200).send(
      createSuccessResponse(
        { permissions },
        request.id,
      ),
    );
  }

  async getRoles(request: FastifyRequest, reply: FastifyReply) {
    const roles = await this.rbacService.getRoles();
    return reply.status(200).send(
      createSuccessResponse(
        { roles },
        request.id,
      ),
    );
  }
}
