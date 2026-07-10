import { z } from 'zod';
import { UserRole } from '@ai-career-os/types';

// ─── Password Schema ──────────────────────────────
// Enforces OWASP ASVS §2.1 password requirements:
//   - Minimum 12 characters (NIST SP 800-63B)
//   - Maximum 128 characters (prevents Argon2 DoS)
//   - At least one uppercase, one lowercase, one digit, one special char
const PASSWORD_SCHEMA = z
  .string()
  .min(12, 'Password must be at least 12 characters long')
  .max(128, 'Password must not exceed 128 characters')
  .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
  .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
  .regex(/\d/, 'Password must contain at least one number')
  .regex(/[^a-zA-Z0-9]/, 'Password must contain at least one special character');

// ─── Registration ──────────────────────────────────
export const registerSchema = z.object({
  email: z.string().email('Invalid email address format').max(255),
  username: z
    .string()
    .min(6, 'Username must be at least 6 characters long')
    .max(50, 'Username must not exceed 50 characters')
    .regex(/^[a-zA-Z0-9_\-]+$/, 'Username can only contain alphanumeric characters, underscores, and hyphens'),
  password: PASSWORD_SCHEMA,
  confirmPassword: z.string(),
  fullName: z.string().min(2, 'Full name is required').max(200).optional(),
  phone: z.string().min(7).max(20).optional(),
  university: z.string().max(255).optional(),
  country: z.string().max(100).optional(),
  termsAccepted: z.boolean().optional(),
  role: z.nativeEnum(UserRole).default(UserRole.CANDIDATE),
}).refine((data) => data.password === data.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword'],
});

// ─── Login ─────────────────────────────────────────
export const loginSchema = z.object({
  email: z.string().email('Invalid email address format'),
  password: z.string().min(1, 'Password is required'),
  rememberMe: z.boolean().optional().default(false),
});

// ─── OTP Verify ────────────────────────────────────
export const otpVerifySchema = z.object({
  userId: z.string().uuid('Invalid user identifier format'),
  code: z
    .string()
    .length(6, 'Verification code must be exactly 6 digits')
    .regex(/^\d+$/, 'Verification code must only contain numbers'),
});

// ─── OTP Request ───────────────────────────────────
export const otpRequestSchema = z.object({
  userId: z.string().uuid('Invalid user identifier format'),
  purpose: z.enum(['email_verification', 'password_reset', 'mfa'], {
    errorMap: () => ({ message: 'Invalid OTP verification purpose' }),
  }),
});

// ─── Change Password (authenticated) ───────────────
export const changePasswordSchema = z.object({
  passwordOld: z.string().min(1, 'Current password is required'),
  passwordNew: PASSWORD_SCHEMA,
});

// ─── Forgot Password (public) ─────────────────────
export const forgotPasswordSchema = z.object({
  email: z.string().email('Invalid email address format'),
});

// ─── Reset Password (public, with token) ──────────
export const resetPasswordSchema = z.object({
  token: z.string().min(1, 'Reset token is required'),
  passwordNew: PASSWORD_SCHEMA,
});

// ─── Email Verification ───────────────────────────
export const verifyEmailSchema = z.object({
  token: z.string().min(1, 'Verification token is required'),
});

// ─── Resend Verification ──────────────────────────
export const resendVerificationSchema = z.object({
  email: z.string().email('Invalid email address format'),
});

// ─── MFA Enable ───────────────────────────────────
export const mfaEnableSchema = z.object({
  type: z.enum(['totp', 'email']),
});

// ─── MFA Verify ───────────────────────────────────
export const mfaVerifySchema = z.object({
  code: z.string().min(4).max(20),
  tempToken: z.string().optional(),
});

// ─── MFA Disable ──────────────────────────────────
export const mfaDisableSchema = z.object({
  code: z.string().min(1),
});

// ─── Passkey Rename ───────────────────────────────
export const passkeyRenameSchema = z.object({
  nickname: z.string().min(1).max(100),
});

// ─── OAuth Initiate ───────────────────────────────
export const oauthInitiateSchema = z.object({
  redirectUri: z.string().url().optional(),
});

// ─── OAuth Unlink ─────────────────────────────────
export const oauthUnlinkSchema = z.object({
  provider: z.string().min(1),
});

// ─── Inferred DTO Types ───────────────────────────
export type RegisterDto = z.infer<typeof registerSchema>;
export type LoginDto = z.infer<typeof loginSchema>;
export type OtpVerifyDto = z.infer<typeof otpVerifySchema>;
export type OtpRequestDto = z.infer<typeof otpRequestSchema>;
export type ChangePasswordDto = z.infer<typeof changePasswordSchema>;
export type ForgotPasswordDto = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordDto = z.infer<typeof resetPasswordSchema>;
export type VerifyEmailDto = z.infer<typeof verifyEmailSchema>;
export type ResendVerificationDto = z.infer<typeof resendVerificationSchema>;
