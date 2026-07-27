import * as dns from 'node:dns';

import * as nodemailer from 'nodemailer';

import type { IEmailProvider, SendEmailPayload, SendEmailResult } from './email.provider.interface';
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

    const portNum = Number(config.port) || 587;
    const isSecure = portNum === 465 || String(config.secure) === 'true';

    const transportConfig: any = {
      host: config.host || 'smtp-relay.brevo.com',
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

    // Verify SMTP connection on startup
    this.transporter.verify((err) => {
      if (err) {
        // eslint-disable-next-line no-console
        console.error('CRITICAL: Brevo SMTP Connection Verification Failed:', err);
        this.logger.error(
          { err, host: config.host, port: portNum },
          'Brevo SMTP connection verification failed',
        );
      } else {
        // eslint-disable-next-line no-console
        console.log(`SUCCESS: Brevo SMTP connection verified successfully to ${config.host}:${portNum}`);
        this.logger.info({ host: config.host, port: portNum }, 'Brevo SMTP connection verified successfully');
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

      const info = await this.transporter.sendMail({
        from: payload.from,
        to: payload.to,
        subject: payload.subject,
        html: payload.html,
        attachments,
      });

      const messageId = info.messageId || 'unknown';
      this.logger.info(
        { messageId, recipient: payload.to, subject: payload.subject, latencyMs: Date.now() - startTime },
        'Email delivered successfully via Brevo SMTP (Nodemailer)',
      );

      return {
        id: messageId,
        provider: 'brevo-smtp',
      };
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(`CRITICAL: Failed to deliver email to ${payload.to} via Brevo SMTP:`, err);
      this.logger.error(
        { err, recipient: payload.to, latencyMs: Date.now() - startTime },
        'Failed to deliver email via Brevo SMTP',
      );
      throw err;
    }
  }
}
