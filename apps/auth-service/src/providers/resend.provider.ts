import { Resend } from 'resend';

import type { IEmailProvider, SendEmailPayload, SendEmailResult } from './email.provider.interface';
import type { Logger } from 'pino';

export class ResendProvider implements IEmailProvider {
  private readonly client: Resend;
  private readonly logger: Logger;

  constructor(apiKey: string, logger: Logger) {
    if (!apiKey) {
      throw new Error('Resend API key is required to initialize ResendProvider');
    }
    this.client = new Resend(apiKey);
    this.logger = logger.child({ component: 'ResendProvider' });
  }

  async sendEmail(payload: SendEmailPayload): Promise<SendEmailResult> {
    const startTime = Date.now();
    try {
      const attachments = payload.attachments?.map((att) => ({
        filename: att.filename,
        content: att.content,
      }));

      const { data, error } = await this.client.emails.send({
        from: payload.from,
        to: [payload.to],
        subject: payload.subject,
        html: payload.html,
        attachments,
      });

      if (error) {
        this.logger.error(
          { error, recipient: payload.to, latencyMs: Date.now() - startTime },
          'Resend API returned error response',
        );
        throw new Error(`Resend Error: ${error.message}`);
      }

      const emailId = data?.id || 'unknown';
      this.logger.info(
        { emailId, recipient: payload.to, subject: payload.subject, latencyMs: Date.now() - startTime },
        'Email delivered successfully via Resend HTTPS API',
      );

      return {
        id: emailId,
        provider: 'resend',
      };
    } catch (err) {
      this.logger.error(
        { err, recipient: payload.to, latencyMs: Date.now() - startTime },
        'Failed to deliver email via Resend',
      );
      throw err;
    }
  }
}
