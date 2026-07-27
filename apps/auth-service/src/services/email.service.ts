import * as dns from 'node:dns';
import * as fs from 'node:fs';
import * as path from 'node:path';

import * as nodemailer from 'nodemailer';

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
  private readonly transporter: nodemailer.Transporter;
  private readonly logger: Logger;
  private readonly from: string;
  private readonly frontendUrl: string;
  private readonly resendApiKey?: string;

  constructor(
    config: {
      host: string;
      port: number;
      user?: string;
      pass?: string;
      secure: boolean;
      from: string;
      frontendUrl?: string;
      resendApiKey?: string;
    },
    logger: Logger,
  ) {
    this.logger = logger.child({ component: 'EmailService' });
    this.from = config.from;
    this.resendApiKey = config.resendApiKey;
    const rawUrl = (config.frontendUrl || 'http://localhost:3000').split(',')[0] || 'http://localhost:3000';
    this.frontendUrl = rawUrl.trim();

    const portNum = Number(config.port) || 587;
    const isSecure = portNum === 465;

    const transportConfig: any = {
      host: config.host,
      port: portNum,
      secure: isSecure,
      requireTLS: !isSecure,
      connectionTimeout: 15000,
      socketTimeout: 15000,
      greetingTimeout: 15000,
      dnsTimeout: 10000,
      tls: {
        rejectUnauthorized: false,
        minVersion: 'TLSv1.2',
      },
      lookup: (hostname: string, _options: any, callback: any) => {
        dns.lookup(hostname, { family: 4 }, callback);
      },
    };

    if (config.user && config.pass) {
      transportConfig.auth = {
        user: config.user,
        pass: config.pass,
      };
    }

    this.transporter = nodemailer.createTransport(transportConfig);

    if (this.resendApiKey) {
      this.logger.info('Resend HTTP API key detected; email service will use Resend HTTPS API (Port 443)');
    } else {
      // Verify SMTP connection on startup asynchronously
      this.transporter.verify((err) => {
        if (err) {
          this.logger.error({ err, host: config.host, port: portNum, secure: isSecure }, 'SMTP connection verification failed. Email delivery will retry on send.');
        } else {
          this.logger.info({ host: config.host, port: portNum }, 'SMTP connection verified successfully');
        }
      });
    }
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
   * Sends an email using a specified template via Resend HTTP API (if configured) or Nodemailer SMTP fallback.
   */
  async sendEmail(options: EmailOptions): Promise<void> {
    try {
      const html = this.loadTemplate(options.templateName, options.variables);

      if (this.resendApiKey) {
        const response = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.resendApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: this.from,
            to: [options.to],
            subject: options.subject,
            html,
          }),
        });

        if (!response.ok) {
          const errBody = await response.text();
          throw new Error(`Resend API error (${response.status}): ${errBody}`);
        }

        this.logger.info(
          { to: options.to, subject: options.subject, template: options.templateName, provider: 'Resend API' },
          'Email sent successfully via Resend HTTPS API',
        );
        return;
      }

      const mailOptions = {
        from: this.from,
        to: options.to,
        subject: options.subject,
        html,
      };

      await this.transporter.sendMail(mailOptions);
      this.logger.info(
        { to: options.to, subject: options.subject, template: options.templateName, provider: 'Nodemailer SMTP' },
        'Email sent successfully',
      );
    } catch (err) {
      this.logger.error(
        { err, to: options.to, subject: options.subject, template: options.templateName },
        'Failed to send email',
      );
      throw err;
    }
  }

  /**
   * Sends an email with a file attachment using a specified template.
   */
  async sendEmailWithAttachment(options: EmailWithAttachmentOptions): Promise<void> {
    try {
      const html = this.loadTemplate(options.templateName, options.variables);

      const mailOptions = {
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
      };

      await this.transporter.sendMail(mailOptions);
      this.logger.info(
        { to: options.to, subject: options.subject, template: options.templateName, attachment: options.attachment.filename },
        'Email with attachment sent successfully',
      );
    } catch (err) {
      this.logger.error(
        { err, to: options.to, subject: options.subject, template: options.templateName },
        'Failed to send email with attachment',
      );
      throw err;
    }
  }

  /**
   * Convenience helper to send verification link.
   */
  async sendVerificationEmail(email: string, username: string, token: string): Promise<void> {
    const verificationLink = `${this.frontendUrl}/verify-email?token=${token}`;

    await this.sendEmail({
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
  async sendPasswordResetEmail(email: string, token: string): Promise<void> {
    const resetLink = `${this.frontendUrl}/reset-password?token=${token}`;

    await this.sendEmail({
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
  async sendOtpEmail(email: string, purpose: string, code: string): Promise<void> {
    const formattedPurpose = purpose.replace(/_/g, ' ').toUpperCase();

    await this.sendEmail({
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
