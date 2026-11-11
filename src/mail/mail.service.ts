import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

/**
 * MailService — shared SMTP transport for transactional and admin emails.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transporter: nodemailer.Transporter;
  private readonly from: string;

  constructor(private readonly config: ConfigService) {
    this.transporter = nodemailer.createTransport({
      host: this.config.get('SMTP_HOST'),
      port: Number(this.config.get('SMTP_PORT') || 587),
      secure: false,
      auth: {
        user: this.config.get('SMTP_USER'),
        pass: this.config.get('SMTP_PASS'),
      },
    });
    this.from = this.config.get('MAIL_FROM') || '';
  }

  async send(options: { to: string; subject: string; html: string }): Promise<void> {
    if (!this.from) {
      throw new Error('MAIL_FROM is not configured');
    }

    await this.transporter.sendMail({
      from: this.from,
      ...options,
    });
  }
}
