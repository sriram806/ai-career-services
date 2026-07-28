import * as dns from 'node:dns';
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
    const serviceName = config.service || (this.host.includes('gmail') ? 'gmail' : undefined);

    // Custom IPv4 lookup resolver to prevent ENETUNREACH errors on cloud host environments (e.g. Render)
    // where IPv6 addresses (2404:6800:...) are returned by DNS getaddrinfo but lack egress routing.
    const customIpv4Lookup = (
      hostname: string,
      options: dns.LookupOptions,
      callback: (err: NodeJS.ErrnoException | null, address: string, family: number) => void,
    ) => {
      const opts: dns.LookupOptions =
        typeof options === 'object' && options !== null ? { ...options, family: 4 } : { family: 4 };
      dns.lookup(hostname, opts, (err, address, family) => {
        if (err) {
          callback(err, '', 4);
        } else {
          callback(null, address as string, family);
        }
      });
    };

    const transportOptions: SMTPPool.Options & { family?: number; lookup?: any; service?: string } = {
      ...(serviceName && { service: serviceName }),
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
      connectionTimeout: 10000,
      socketTimeout: 15000,
      greetingTimeout: 10000,
      dnsTimeout: 5000,
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
