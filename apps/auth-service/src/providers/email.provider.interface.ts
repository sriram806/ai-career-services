export interface EmailAttachment {
  filename: string;
  content: Buffer;
  contentType?: string;
}

export interface SendEmailPayload {
  to: string;
  from: string;
  subject: string;
  html: string;
  attachments?: EmailAttachment[];
}

export interface SendEmailResult {
  id: string;
  provider: string;
}

export interface IEmailProvider {
  sendEmail(payload: SendEmailPayload): Promise<SendEmailResult>;
}
