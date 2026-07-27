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
    const isSecure = portNum === 465;

    const transportConfig: any = {
      host: config.host,
      port: portNum,
      secure: isSecure,
      requireTLS: !isSecure,
      connectionTimeout: 10000,
      socketTimeout: 10000,
      greetingTimeout: 10000,
      dnsTimeout: 8000,
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
        { messageId, recipient: payload.to, latencyMs: Date.now() - startTime },
        'Email delivered successfully via Nodemailer SMTP',
      );

      return {
        id: messageId,
        provider: 'nodemailer',
      };
    } catch (err) {
      this.logger.error(
        { err, recipient: payload.to, latencyMs: Date.now() - startTime },
        'Failed to deliver email via Nodemailer SMTP',
      );
      throw err;
    }
  }
}
