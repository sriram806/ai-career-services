import type { IEmailProvider, SendEmailPayload, SendEmailResult } from './email.provider.interface';
import type { Logger } from 'pino';

export class FallbackEmailProvider implements IEmailProvider {
  private readonly logger: Logger;

  constructor(
    private readonly providers: IEmailProvider[],
    logger: Logger,
  ) {
    this.logger = logger.child({ component: 'FallbackEmailProvider' });
    if (!providers || providers.length === 0) {
      throw new Error('FallbackEmailProvider requires at least one provider');
    }
  }

  async sendEmail(payload: SendEmailPayload): Promise<SendEmailResult> {
    const errors: Error[] = [];

    for (let i = 0; i < this.providers.length; i++) {
      const provider = this.providers[i];
      try {
        const result = await provider!.sendEmail(payload);
        return result;
      } catch (err: any) {
        this.logger.warn(
          { providerIndex: i, err: err?.message || err },
          'Email provider attempt failed, failing over to next provider...',
        );
        errors.push(err);
      }
    }

    const lastError = errors[errors.length - 1];
    this.logger.error({ errors }, 'All email providers in fallback chain failed to deliver email');
    throw new Error(`All email providers failed: ${lastError?.message || 'Unknown error'}`);
  }
}
