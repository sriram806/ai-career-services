import * as dns from 'node:dns';
import * as net from 'node:net';
import { ErrorFactory } from '@ai-career-os/errors';
import * as nodemailer from 'nodemailer';

import type { IEmailProvider, SendEmailPayload, SendEmailResult } from './email.provider.interface';
import type SMTPPool from 'nodemailer/lib/smtp-pool';
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

    this.host = config.host || 'smtp.gmail.com';
    this.port = Number(config.port) || 465;
    const isSecure = this.port === 465 || String(config.secure) === 'true';

    // Enterprise Egress DNS Fix: Direct A-record resolution via c-ares (dns.promises.resolve4)
    // completely bypasses glibc getaddrinfo IPv6 precedence on Linux containers (e.g. Render).
    const customIpv4Lookup = (
      hostname: string,
      _options: any,
      callback: (err: NodeJS.ErrnoException | null, address: string, family: number) => void,
    ) => {
      if (net.isIP(hostname)) {
        callback(null, hostname, net.isIPv6(hostname) ? 6 : 4);
        return;
      }

      dns.promises
        .resolve4(hostname)
        .then((addresses) => {
          if (addresses && addresses.length > 0) {
            const selectedIp = addresses[Math.floor(Math.random() * addresses.length)] || addresses[0] || '';
            callback(null, selectedIp, 4);
          } else {
            dns.lookup(hostname, { family: 4 }, (err, address) => {
              callback(err, address || '', 4);
            });
          }
        })
        .catch((err: unknown) => {
          dns.lookup(hostname, { family: 4 }, (fallbackErr, address) => {
            const finalErr = (fallbackErr || err) as NodeJS.ErrnoException | null;
            const finalAddress = address || '';
            callback(finalErr, finalAddress, 4);
          });
        });
    };

    const transportOptions: SMTPPool.Options & { family?: number; lookup?: any } = {
      host: this.host,
      port: this.port,
      secure: isSecure,
      requireTLS: !isSecure,
      // Enterprise Egress Fix: Enforce IPv4 socket connections
      family: 4,
      lookup: customIpv4Lookup,
      // High-performance pooling & timeout controls
      pool: true,
      maxConnections: 5,
      maxMessages: 100,
      connectionTimeout: 30000,
      socketTimeout: 30000,
      greetingTimeout: 30000,
      dnsTimeout: 15000,
      tls: {
        rejectUnauthorized: process.env.NODE_ENV === 'production',
        minVersion: 'TLSv1.2',
        servername: this.host,
      },
    };

    const cleanUser = config.user ? config.user.trim() : undefined;
    const cleanPass = config.pass ? config.pass.trim().replace(/\s+/g, '') : undefined;

    if (cleanUser && cleanPass) {
      transportOptions.auth = {
        user: cleanUser,
        pass: cleanPass,
      };
    }

    this.transporter = nodemailer.createTransport(transportOptions as nodemailer.TransportOptions);

    // Non-blocking async SMTP verification on startup
    void this.verifyConnectionSilently();
  }

  /**
   * Verifies SMTP connection asynchronously without blocking server startup.
   */
  private async verifyConnectionSilently(): Promise<boolean> {
    try {
      await this.transporter.verify();
      this.logger.info(
        { host: this.host, port: this.port, family: 4 },
        'SUCCESS: SMTP transport connection verified successfully (IPv4)',
      );
      return true;
    } catch (err) {
      this.logger.error(
        { err: err as Error, host: this.host, port: this.port },
        'CRITICAL: SMTP transport connection verification failed',
      );
      return false;
    }
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
        'Email delivered successfully via SMTP (Nodemailer)',
      );

      return {
        id: messageId,
        provider: 'nodemailer-smtp',
      };
    } catch (err: unknown) {
      this.logger.error(
        { err: err as Error, recipient: payload.to, latencyMs: Date.now() - startTime },
        'Failed to deliver email via SMTP',
      );
      throw ErrorFactory.externalServiceError('nodemailer-smtp', err as Error);
    }
  }
}
