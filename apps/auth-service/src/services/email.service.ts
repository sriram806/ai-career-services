import * as nodemailer from 'nodemailer';
import * as path from 'node:path';
import * as fs from 'node:fs';
import type { Logger } from 'pino';

export interface EmailOptions {
  to: string;
  subject: string;
  templateName: string;
  variables: Record<string, string>;
}

export class EmailService {
  private readonly transporter: nodemailer.Transporter;
  private readonly logger: Logger;
  private readonly from: string;

  constructor(
    config: {
      host: string;
      port: number;
      user?: string;
      pass?: string;
      secure: boolean;
      from: string;
    },
    logger: Logger,
  ) {
    this.logger = logger.child({ component: 'EmailService' });
    this.from = config.from;

    const transportConfig: any = {
      host: config.host,
      port: config.port,
      secure: config.secure,
    };

    if (config.user && config.pass) {
      transportConfig.auth = {
        user: config.user,
        pass: config.pass,
      };
    }

    this.transporter = nodemailer.createTransport(transportConfig);

    // Verify SMTP connection on startup
    this.transporter.verify((err) => {
      if (err) {
        this.logger.error({ err }, 'SMTP connection verification failed');
      } else {
        this.logger.info('SMTP connection verified successfully');
      }
    });
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
   * Sends an email using a specified template.
   */
  async sendEmail(options: EmailOptions): Promise<void> {
    try {
      const html = this.loadTemplate(options.templateName, options.variables);

      const mailOptions = {
        from: this.from,
        to: options.to,
        subject: options.subject,
        html,
      };

      await this.transporter.sendMail(mailOptions);
      this.logger.info(
        { to: options.to, subject: options.subject, template: options.templateName },
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
   * Convenience helper to send verification link.
   */
  async sendVerificationEmail(email: string, username: string, token: string): Promise<void> {
    // Determine verification link (can be configured; defaults to typical gateway/client endpoint)
    const verificationLink = `http://localhost:3000/verify-email?token=${token}`;

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
    const resetLink = `http://localhost:3000/reset-password?token=${token}`;

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
