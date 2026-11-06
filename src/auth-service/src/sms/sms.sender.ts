import { Injectable, Logger } from '@nestjs/common';

/** Sends SMS messages. Swap the implementation per SMS_PROVIDER. */
export abstract class SmsSender {
  abstract send(phone: string, message: string): Promise<void>;
}

/** Development only: writes the message to the log instead of sending it. */
@Injectable()
export class LogSmsSender extends SmsSender {
  private readonly logger = new Logger('LogSmsSender');

  async send(phone: string, message: string): Promise<void> {
    this.logger.warn(`SMS to ${phone}: ${message}`);
  }
}
