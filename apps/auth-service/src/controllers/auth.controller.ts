import { createSuccessResponse } from '@ai-career-os/common';
import { getConfig } from '@ai-career-os/config';
import { ErrorFactory } from '@ai-career-os/errors';
import { validate } from '@ai-career-os/validation';

import {
  registerSchema,
  loginSchema,
  changePasswordSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  verifyEmailSchema,
  resendVerificationSchema,
  mfaEnableSchema,
  mfaVerifySchema,
  mfaDisableSchema,
  oauthInitiateSchema,
  oauthUnlinkSchema,
} from '../validators/auth.validator';

import type { AuditRepository } from '../repositories/audit.repository';
import type { SessionRepository } from '../repositories/session.repository';
import type { UserRepository } from '../repositories/user.repository';
import type { AuthService } from '../services/auth.service';
import type { DataExportService } from '../services/data-export.service';
import type { EmailVerificationService } from '../services/email-verification.service';
import type { MfaService } from '../services/mfa.service';
import type { OAuthService } from '../services/oauth.service';
import type { OtpService } from '../services/otp.service';
import type { PasswordResetService } from '../services/password-reset.service';
import type { RbacService } from '../services/rbac.service';
import type { SessionService } from '../services/session.service';
import type { TrustedDeviceService } from '../services/trusted-device.service';
import type { FastifyRequest, FastifyReply } from 'fastify';

export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly emailVerificationService: EmailVerificationService,
    private readonly passwordResetService: PasswordResetService,
    private readonly sessionService: SessionService,
    private readonly trustedDeviceService: TrustedDeviceService,
    private readonly mfaService: MfaService,
    private readonly dataExportService: DataExportService,
    private readonly otpService: OtpService,

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
  private getAuthUser(request: FastifyRequest): {
    userId: string;
    email: string;
    sessionId: string;
  } {
    const user = (request as any).user;
    if (!user?.userId) {
      throw ErrorFactory.unauthorized('Authentication required');
    }
    return user;
  }

  // ─── Helper: set refresh token cookie ────────────
  private setRefreshTokenCookie(reply: FastifyReply, token: string, rememberMe = false): void {
    reply.setCookie('refreshToken', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      ...(rememberMe && { maxAge: 30 * 24 * 60 * 60 }), // 30 days if rememberMe, otherwise session cookie
    });
  }

  // ─── Helper: clear refresh token cookie ──────────
  private clearRefreshTokenCookie(reply: FastifyReply): void {
    reply.clearCookie('refreshToken', { path: '/' });
  }

  // ─── Helper: extract refresh token from cookie or body ─
  private getRefreshToken(request: FastifyRequest): string | null {
    return request.cookies['refreshToken'] || (request.body as any)?.refreshToken || null;
  }

  // POST  -> /auth/register
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
    const otp = await this.emailVerificationService.generateVerificationToken(user.id);

    return reply.status(201).send(
      createSuccessResponse(
        {
          message: 'Registration successful. Please verify your email address.',
          userId: user.id,
          email: user.email,
          verificationOtp: process.env.NODE_ENV !== 'production' ? otp : undefined,
        },
        request.id,
      ),
    );
  }

  // ═══════════════════════════════════════════════════
  // ─── POST /auth/login ─────────────────────────────
  // ══════════════════════════════════════════════════

  async login(request: FastifyRequest, reply: FastifyReply) {
    const data = validate(loginSchema, request.body);
    const ctx = this.getContext(request);

    const result = await this.authService.login({
      email: data.email,
      password: data.password,
      rememberMe: data.rememberMe,
      ...ctx,
    });

    if (result.mfaRequired) {
      return reply.status(200).send(
        createSuccessResponse(
          {
            mfaRequired: true,
            tempToken: result.tempToken,
          },
          request.id,
        ),
      );
    }

    this.setRefreshTokenCookie(reply, result.refreshToken!, data.rememberMe);

    return reply.status(200).send(
      createSuccessResponse(
        {
          accessToken: result.accessToken,
          refreshToken: result.refreshToken,
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

    return reply
      .status(200)
      .send(createSuccessResponse({ message: 'Successfully logged out' }, request.id));
  }

  // ═══════════════════════════════════════════════════
  // ─── POST /auth/logout-all ────────────────────────
  // ═══════════════════════════════════════════════════

  async logoutAll(request: FastifyRequest, reply: FastifyReply) {
    const { userId } = this.getAuthUser(request);
    const ctx = this.getContext(request);

    await this.authService.logoutAll(userId, ctx);
    this.clearRefreshTokenCookie(reply);

    return reply
      .status(200)
      .send(
        createSuccessResponse({ message: 'Successfully logged out from all devices' }, request.id),
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

    this.setRefreshTokenCookie(reply, result.refreshToken, result.isRememberMe);

    return reply
      .status(200)
      .send(
        createSuccessResponse(
          { accessToken: result.accessToken, refreshToken: result.refreshToken },
          request.id,
        ),
      );
  }
  // POST -> /auth/forgot-password

  async forgotPassword(request: FastifyRequest, reply: FastifyReply) {
    const data = validate(forgotPasswordSchema, request.body);
    const ctx = this.getContext(request);

    const resetToken = await this.passwordResetService.generateResetToken(data.email, ctx);

    if (!resetToken) {
      const email = data.email.toLowerCase().trim();
      const user = await this.userRepository.findByEmail(email);
      if (!user) {
        throw ErrorFactory.notFound(`No account found with email address: ${data.email}`);
      }
      throw ErrorFactory.badRequest(
        'A password reset link was sent recently. Please wait 60 seconds before requesting another.',
      );
    }

    return reply.status(200).send(
      createSuccessResponse(
        {
          message: 'Password reset link has been sent successfully.',
          resetToken,
        },
        request.id,
      ),
    );
  }

  // POST -> /auth/reset-password

  async resetPassword(request: FastifyRequest, reply: FastifyReply) {
    const data = validate(resetPasswordSchema, request.body);
    const ctx = this.getContext(request);

    await this.passwordResetService.resetPassword(data.token, data.passwordNew, ctx);

    return reply.status(200).send(
      createSuccessResponse(
        {
          message: 'Password has been reset successfully. All active sessions have been revoked.',
        },
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

    return reply
      .status(200)
      .send(
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

    return reply.status(200).send(createSuccessResponse({ user }, request.id));
  }

  // ═══════════════════════════════════════════════════
  // ─── GET /auth/sessions ───────────────────────────
  // ═══════════════════════════════════════════════════

  async getSessions(request: FastifyRequest, reply: FastifyReply) {
    const { userId } = this.getAuthUser(request);
    const sessions = await this.sessionService.getActiveSessions(userId);

    return reply.status(200).send(createSuccessResponse({ sessions }, request.id));
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

    return reply
      .status(200)
      .send(createSuccessResponse({ message: 'Session revoked successfully' }, request.id));
  }

  // ═══════════════════════════════════════════════════
  // ─── POST /auth/verify-email ──────────────────────
  // ═══════════════════════════════════════════════════

  async verifyEmail(request: FastifyRequest, reply: FastifyReply) {
    const data = validate(verifyEmailSchema, request.body);
    const ctx = this.getContext(request);

    await this.emailVerificationService.verifyOtp(data.email, data.code, ctx);

    return reply
      .status(200)
      .send(
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

    // Look up user by email — generic message prevents enumeration for missing accounts
    const user = await this.userRepository.findByEmail(data.email.toLowerCase().trim());

    let verificationToken: string | undefined;
    if (user) {
      if (user.emailVerified) {
        throw ErrorFactory.badRequest('Email is already verified');
      }
      const ctx = this.getContext(request);
      verificationToken = await this.emailVerificationService.resendVerification(user.id, ctx);
    }

    return reply.status(200).send(
      createSuccessResponse(
        {
          message:
            'If the email matches an unverified account, a new verification code has been sent.',
          verificationToken: process.env.NODE_ENV !== 'production' ? verificationToken : undefined,
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
    const payload = validate(oauthInitiateSchema, {
      ...((request.query as Record<string, unknown>) ?? {}),
      ...((request.body as Record<string, unknown>) ?? {}),
    });

    const config = getConfig();
    const defaultCallback =
      config?.AUTH_OAUTH_REDIRECT_URI || 'http://localhost:4000/api/v1/auth/oauth/callback';
    const redirectUri = payload.redirectUri || defaultCallback;

    const { authorizationUrl } = await this.oauthService.initiateFlow(
      provider,
      redirectUri,
      payload.intent,
    );

    return reply.status(200).send(createSuccessResponse({ authorizationUrl }, request.id));
  }

  async oauthCallback(request: FastifyRequest, reply: FastifyReply) {
    const { code, state } = request.query as { code: string; state: string };
    if (!code || !state) {
      throw ErrorFactory.badRequest('OAuth authorization code and state are required');
    }

    const ctx = this.getContext(request);
    const config = getConfig();
    const primaryOrigin = config?.CORS_ORIGIN?.split(',')[0]?.trim() || 'http://localhost:3000';

    let result;
    try {
      result = await this.oauthService.handleCallback(code, state, ctx);
    } catch (err: any) {
      // Handle soft-deleted account in grace period — redirect to login with restore params
      if (err?.requiresRestore) {
        const restoreRedirectUrl =
          `${primaryOrigin}/login?` +
          new URLSearchParams({
            requiresRestore: 'true',
            email: err.email || '',
            daysRemaining: String(err.daysRemaining || 15),
            purgeDate: err.purgeDate || '',
            tempToken: err.tempToken || '',
          }).toString();
        return reply.redirect(restoreRedirectUrl);
      }
      throw err;
    }

    this.setRefreshTokenCookie(reply, result.refreshToken);

    const successType = result.isNewUser ? 'registration-success' : 'login-success';
    const redirectUrl =
      `${primaryOrigin}/success?` +
      new URLSearchParams({
        type: successType,
        provider: result.provider,
        intent: result.intent,
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
        user: JSON.stringify(result.user),
      }).toString();

    return reply.redirect(redirectUrl);
  }

  async oauthUnlink(request: FastifyRequest, reply: FastifyReply) {
    const { userId } = this.getAuthUser(request);
    const { provider } = validate(oauthUnlinkSchema, request.body);

    await this.oauthService.unlinkProvider(userId, provider);

    return reply
      .status(200)
      .send(
        createSuccessResponse({ message: `Successfully unlinked ${provider} account` }, request.id),
      );
  }

  async getConnectedProviders(request: FastifyRequest, reply: FastifyReply) {
    const { userId } = this.getAuthUser(request);
    const providers = await this.oauthService.getConnectedProviders(userId);

    return reply.status(200).send(createSuccessResponse({ providers }, request.id));
  }

  // ═══════════════════════════════════════════════════
  // ─── MFA ENDPOINTS ────────────────────────────────
  // ═══════════════════════════════════════════════════

  async mfaSetup(request: FastifyRequest, reply: FastifyReply) {
    const { userId, email } = this.getAuthUser(request);
    const setup = await this.mfaService.initiateTotpSetup(userId, email);
    return reply.status(200).send(createSuccessResponse(setup, request.id));
  }

  async mfaEnable(request: FastifyRequest, reply: FastifyReply) {
    const { userId, email } = this.getAuthUser(request);
    const data = validate(mfaEnableSchema, request.body);
    const ctx = this.getContext(request);

    if (data.code) {
      const recoveryCodes = await this.mfaService.verifyAndEnableTotp(userId, data.code, ctx);
      return reply
        .status(200)
        .send(
          createSuccessResponse({ message: 'MFA enabled successfully', recoveryCodes }, request.id),
        );
    }

    if (data.type === 'totp') {
      const setup = await this.mfaService.initiateTotpSetup(userId, email);
      return reply.status(200).send(createSuccessResponse(setup, request.id));
    } else {
      const recoveryCodes = await this.mfaService.enableEmailMfa(userId, ctx);
      return reply
        .status(200)
        .send(
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
      const tempSessionDataStr = await this.authService.redisClient.get(
        `mfa:login:temp:${data.tempToken}`,
      );
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

      const plainRefreshToken = this.authService.jwtService.generateRefreshToken(
        !!tempSessionData.rememberMe,
      );
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

      this.setRefreshTokenCookie(reply, plainRefreshToken, !!tempSessionData.rememberMe);

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

      return reply
        .status(200)
        .send(
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

    return reply
      .status(200)
      .send(createSuccessResponse({ message: 'MFA successfully disabled' }, request.id));
  }

  async sendMfaDisableOtp(request: FastifyRequest, reply: FastifyReply) {
    const { userId } = this.getAuthUser(request);
    await this.otpService.generateOtp(userId, 'mfa_disable');

    return reply.status(200).send(
      createSuccessResponse(
        {
          message: 'A 6-digit verification code has been sent to your registered email address.',
        },
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

    return reply.status(200).send(createSuccessResponse({ recoveryCodes }, request.id));
  }

  // ═══════════════════════════════════════════════════
  // ─── SECURITY & AUDIT ENDPOINTS ───────────────────
  // ═══════════════════════════════════════════════════

  async getSecurityEvents(request: FastifyRequest, reply: FastifyReply) {
    const { userId } = this.getAuthUser(request);
    const events = await this.auditRepository.findSecurityEventsForUser(userId);

    return reply.status(200).send(createSuccessResponse({ events }, request.id));
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
      const trusted =
        await this.trustedDeviceService.trustedDeviceRepository.findAllForUser(userId);
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

    return reply
      .status(200)
      .send(createSuccessResponse({ message: 'Device/Session successfully revoked' }, request.id));
  }

  async getPermissions(request: FastifyRequest, reply: FastifyReply) {
    const permissions = await this.rbacService.getPermissions();
    return reply.status(200).send(createSuccessResponse({ permissions }, request.id));
  }

  async getRoles(request: FastifyRequest, reply: FastifyReply) {
    const roles = await this.rbacService.getRoles();
    return reply.status(200).send(createSuccessResponse({ roles }, request.id));
  }

  async deleteAccount(request: FastifyRequest, reply: FastifyReply) {
    const { userId } = this.getAuthUser(request);
    const { password } = (request.body as any) || {};
    const ctx = this.getContext(request);

    await this.authService.deleteAccount({
      userId,
      password,
      ...ctx,
    });

    return reply.status(200).send(
      createSuccessResponse(
        {
          message:
            'Account scheduled for deletion. You have 15 days to restore your account before permanent deletion.',
        },
        request.id,
      ),
    );
  }

  async restoreAccount(request: FastifyRequest, reply: FastifyReply) {
    const { email, tempToken } = (request.body as any) || {};
    if (!email) {
      throw ErrorFactory.badRequest('Email is required to restore account');
    }

    const ctx = this.getContext(request);
    const result = await this.authService.restoreAccount({
      email,
      tempToken,
      ...ctx,
    });

    if (result.refreshToken) {
      this.setRefreshTokenCookie(reply, result.refreshToken);
    }

    return reply.status(200).send(
      createSuccessResponse(
        {
          message: 'Account restored successfully.',
          accessToken: result.accessToken,
          user: result.user,
        },
        request.id,
      ),
    );
  }

  async requestDataExport(request: FastifyRequest, reply: FastifyReply) {
    const { userId } = this.getAuthUser(request);
    const ctx = this.getContext(request);

    await this.dataExportService.requestExport(userId, ctx);

    return reply.status(200).send(
      createSuccessResponse(
        {
          message:
            "Data export request received. We'll email you a secure download link within 24 hours.",
        },
        request.id,
      ),
    );
  }
}
