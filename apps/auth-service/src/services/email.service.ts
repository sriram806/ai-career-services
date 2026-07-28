import * as fs from 'node:fs';
import * as path from 'node:path';

import type { IEmailProvider, SendEmailResult } from '../providers/email.provider.interface';
import type { Logger } from 'pino';

export interface EmailOptions {
  to: string;
  subject: string;
  templateName: string;
  variables: Record<string, string>;
}

export interface EmailWithAttachmentOptions extends EmailOptions {
  attachment: {
    filename: string;
    content: Buffer;
    contentType: string;
  };
}

export class EmailService {
  private readonly provider: IEmailProvider;
  private readonly logger: Logger;
  private readonly from: string;
  private readonly frontendUrl: string;

  constructor(
    provider: IEmailProvider,
    config: {
      from: string;
      frontendUrl?: string;
    },
    logger: Logger,
  ) {
    this.provider = provider;
    this.logger = logger.child({ component: 'EmailService' });
    this.from = config.from;
    const rawUrl =
      (config.frontendUrl || 'http://localhost:3000').split(',')[0] || 'http://localhost:3000';
    this.frontendUrl = rawUrl.trim();
  }

  /**
   * Resolves the template path in a way that is robust to both dev (tsx) and prod (dist) environments.
   */
  private getTemplatePath(templateName: string): string {
    const pathsToTry = [
      path.resolve(__dirname, '../templates', templateName),
      path.resolve(__dirname, '../../src/templates', templateName),
      path.resolve(process.cwd(), 'src/templates', templateName),
      path.resolve(process.cwd(), 'apps/auth-service/src/templates', templateName),
    ];

    for (const p of pathsToTry) {
      if (fs.existsSync(p)) {
        return p;
      }
    }
    throw new Error(`Template ${templateName} not found in any of the resolved paths.`);
  }

  /**
   * Loads template from disk, compiles it by replacing variable placeholders, and returns HTML string.
   */
  private loadTemplate(templateName: string, variables: Record<string, string>): string {
    const templatePath = this.getTemplatePath(templateName);
    let html = fs.readFileSync(templatePath, 'utf8');

    // Replace all occurrences of {{key}} with value
    for (const [key, value] of Object.entries(variables)) {
      const placeholder = new RegExp(`{{${key}}}`, 'g');
      html = html.replace(placeholder, value);
    }

    return html;
  }

  /**
   * Sends an email using a specified template via the configured IEmailProvider.
   */
  async sendEmail(options: EmailOptions): Promise<SendEmailResult> {
    const html = this.loadTemplate(options.templateName, options.variables);
    this.logger.info(
      { to: options.to, subject: options.subject, template: options.templateName },
      'Dispatching email via email provider...',
    );

    return this.provider.sendEmail({
      from: this.from,
      to: options.to,
      subject: options.subject,
      html,
    });
  }

  /**
   * Sends an email with a file attachment using a specified template.
   */
  async sendEmailWithAttachment(options: EmailWithAttachmentOptions): Promise<SendEmailResult> {
    const html = this.loadTemplate(options.templateName, options.variables);

    return this.provider.sendEmail({
      from: this.from,
      to: options.to,
      subject: options.subject,
      html,
      attachments: [
        {
          filename: options.attachment.filename,
          content: options.attachment.content,
          contentType: options.attachment.contentType,
        },
      ],
    });
  }

  /**
   * Convenience helper to send verification link.
   */
  async sendVerificationEmail(
    email: string,
    username: string,
    token: string,
  ): Promise<SendEmailResult> {
    const verificationLink = `${this.frontendUrl}/verify-email?token=${token}`;

    return this.sendEmail({
      to: email,
      subject: 'Verify Your Email Address - AI Career OS',
      templateName: 'email-verification.html',
      variables: {
        username,
        verificationLink,
        verificationToken: token,
      },
    });
  }

  /**
   * Convenience helper to send password reset link.
   */
  async sendPasswordResetEmail(email: string, token: string): Promise<SendEmailResult> {
    const resetLink = `${this.frontendUrl}/reset-password?token=${token}`;

    return this.sendEmail({
      to: email,
      subject: 'Reset Your Password - AI Career OS',
      templateName: 'password-reset.html',
      variables: {
        resetLink,
        resetToken: token,
      },
    });
  }

  /**
   * Convenience helper to send OTP.
   */
  async sendOtpEmail(email: string, purpose: string, code: string): Promise<SendEmailResult> {
    const formattedPurpose = purpose.replace(/_/g, ' ').toUpperCase();

    return this.sendEmail({
      to: email,
      subject: `Your Verification Code: ${code} - AI Career OS`,
      templateName: 'otp.html',
      variables: {
        purpose: formattedPurpose,
        otpCode: code,
      },
    });
  }
}
