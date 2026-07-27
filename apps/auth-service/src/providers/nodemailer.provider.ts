import * as nodemailer from 'nodemailer';

import type { IEmailProvider, SendEmailPayload, SendEmailResult } from './email.provider.interface';
import type SMTPTransport from 'nodemailer/lib/smtp-transport';
import type { Logger } from 'pino';

export class NodemailerProvider implements IEmailProvider {
  private readonly transporter: nodemailer.Transporter;
  private readonly logger: Logger;

  constructor(
    config: {
      host: string;
      port: number;
      user?: string;
      pass?: string;
      secure?: boolean;
    },
    logger: Logger,
  ) {
    this.logger = logger.child({ component: 'NodemailerProvider' });

    const host = config.host || 'smtp.gmail.com';
    const portNum = Number(config.port) || 587;
    const isSecure = portNum === 465 || String(config.secure) === 'true';

    const transportOptions: SMTPTransport.Options = {
      host,
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
    };

    if (config.user && config.pass) {
      transportOptions.auth = {
        user: config.user,
        pass: config.pass,
      };
    }

    this.transporter = nodemailer.createTransport(transportOptions);

    // Verify SMTP connection on startup
    this.transporter.verify((err) => {
      if (err) {
        // eslint-disable-next-line no-console
        console.error('CRITICAL: SMTP Connection Verification Failed:', err);
        this.logger.error({ err, host, port: portNum }, 'SMTP connection verification failed');
      } else {
        // eslint-disable-next-line no-console
        console.log(`SUCCESS: SMTP connection verified successfully (${host}:${portNum})`);
        this.logger.info({ host, port: portNum }, 'SMTP connection verified successfully');
      }
    });
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
        'Email delivered successfully via SMTP (Nodemailer)',
      );

      return {
        id: messageId,
        provider: 'nodemailer-smtp',
      };
    } catch (err: unknown) {
      // eslint-disable-next-line no-console
      console.error(`CRITICAL: Failed to deliver email to ${payload.to} via SMTP:`, err);
      this.logger.error(
        { err: err as Error, recipient: payload.to, latencyMs: Date.now() - startTime },
        'Failed to deliver email via SMTP',
      );
      throw err;
    }
  }
}
