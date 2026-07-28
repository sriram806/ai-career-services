import { ErrorFactory } from '@ai-career-os/errors';
import nodemailer from 'nodemailer';

import type { IEmailProvider, SendEmailPayload, SendEmailResult } from './email.provider.interface';
import type { Logger } from 'pino';

export class NodemailerProvider implements IEmailProvider {
  private readonly transporter: nodemailer.Transporter;
  private readonly logger: Logger;
  private readonly host: string;
  private readonly port: number;

  constructor(
    config: {
      service?: string;
      host: string;
      port: number;
      user?: string;
      pass?: string;
      secure?: boolean;
    },
    logger: Logger,
  ) {
    this.logger = logger.child({ component: 'NodemailerProvider' });

    this.host = config.host || 'smtp-relay.brevo.com';
    this.port = Number(config.port) || 587;
    const isSecure = this.port === 465 || String(config.secure) === 'true';

    const cleanUser = config.user ? config.user.trim() : undefined;
    const cleanPass = config.pass ? config.pass.trim() : undefined;

    this.transporter = nodemailer.createTransport({
      host: this.host,
      port: this.port,
      secure: isSecure,
      auth: cleanUser && cleanPass ? {
        user: cleanUser,
        pass: cleanPass,
      } : undefined,
    });
  }

  /**
   * Public health diagnostic helper.
   */
  async verifyConnection(): Promise<{ success: boolean; error?: string }> {
    try {
      await this.transporter.verify();
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err?.message || String(err) };
    }
  }

  async sendEmail(payload: SendEmailPayload): Promise<SendEmailResult> {
    const startTime = Date.now();
    try {
      const attachments = payload.attachments?.map((att) => ({
        filename: att.filename,
        content: att.content,
        contentType: att.contentType,
      }));

      const info = (await this.transporter.sendMail({
        from: payload.from,
        to: payload.to,
        subject: payload.subject,
        html: payload.html,
        attachments,
      })) as { messageId?: string };

      const messageId = info.messageId ?? 'unknown';
      this.logger.info(
        {
          messageId,
          recipient: payload.to,
          subject: payload.subject,
          latencyMs: Date.now() - startTime,
        },
        'Email delivered successfully via Nodemailer (Brevo SMTP)',
      );

      return {
        id: messageId,
        provider: 'nodemailer-smtp',
      };
    } catch (err: unknown) {
      this.logger.error(
        { err: err as Error, recipient: payload.to, latencyMs: Date.now() - startTime },
        'Failed to deliver email via Nodemailer',
      );
      throw ErrorFactory.externalServiceError('nodemailer-smtp', err as Error);
    }
  }
}
