import { Module } from '@nestjs/common';
import { DrizzleModule } from '@nestjs/drizzle';
import { drizzle } from 'drizzle-orm/node-postgres';
import { APP_CONFIG, type AppConfig } from './config/config';
import { ConfigModule } from './config/config.module';
import { HealthController } from './health/health.controller';
import { InboxController, InboxService } from './inbox/inbox';
import { InboxWriter } from './orders/inbox-writer';
import { OrderEventConsumer } from './orders/order-event-consumer';
import { SmsDispatcher } from './sms/sms-dispatcher';
import { LogSmsSender, SMS_SENDER, TwilioSmsSender } from './sms/sms-sender';

@Module({
  imports: [
    ConfigModule,
    DrizzleModule.forRootAsync({
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) => ({ drizzle, connection: config.DATABASE_URL }),
    }),
  ],
  controllers: [HealthController, InboxController],
  providers: [
    InboxService,
    InboxWriter,
    OrderEventConsumer,
    SmsDispatcher,
    {
      provide: SMS_SENDER,
      inject: [APP_CONFIG],
      useFactory: (c: AppConfig) =>
        c.SMS_PROVIDER === 'twilio'
          ? new TwilioSmsSender({
              accountSid: c.TWILIO_ACCOUNT_SID!,
              authToken: c.TWILIO_AUTH_TOKEN!,
              from: c.TWILIO_FROM!,
              apiUrl: c.TWILIO_API_URL,
              timeoutMs: c.SMS_TIMEOUT_MS,
            })
          : new LogSmsSender(),
    },
  ],
})
export class AppModule {}
