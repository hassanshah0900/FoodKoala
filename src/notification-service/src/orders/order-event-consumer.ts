import { KafkaJS } from '@confluentinc/kafka-javascript';
import { Inject, Injectable, Logger, type OnApplicationBootstrap, type OnApplicationShutdown } from '@nestjs/common';
import { setTimeout as sleep } from 'node:timers/promises';
import { APP_CONFIG, type AppConfig } from '../config/config';
import { InboxWriter } from './inbox-writer';
import { messagesFor } from './messages';
import { ORDER_TOPICS, orderEventSchema } from './order-events';

const RETRY_MS = 5000;

/**
 * Reads order events (and delivery.assigned) and turns them into notifications.
 * An offset is committed only after its event was recorded; a replay is a no-op
 * because the inbox is unique per event and person (ADR 0007). While the database is down the
 * same event is retried, holding back its partition, so nothing is skipped.
 */
@Injectable()
export class OrderEventConsumer implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(OrderEventConsumer.name);
  private consumer: KafkaJS.Consumer | undefined;
  private stopping = false;

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly inbox: InboxWriter,
  ) {}

  /** Running (or not configured); false once it has crashed. For /readyz. */
  healthy = true;

  async onApplicationBootstrap(): Promise<void> {
    if (!this.config.KAFKA_BROKERS) {
      this.logger.warn('KAFKA_BROKERS is not set: order events are not consumed, nobody is notified');
      return;
    }
    const kafka = new KafkaJS.Kafka({
      kafkaJS: { brokers: this.config.KAFKA_BROKERS, clientId: this.config.KAFKA_GROUP_ID, logLevel: KafkaJS.logLevel.WARN },
    });
    this.consumer = kafka.consumer({
      kafkaJS: { groupId: this.config.KAFKA_GROUP_ID, fromBeginning: true },
      // Notice topics created after we subscribed within seconds, not the default five minutes.
      'topic.metadata.refresh.interval.ms': 5000,
    });
    await this.consumer.connect();
    await this.consumer.subscribe({ topics: ORDER_TOPICS });
    void this.consumer
      .run({ eachMessage: async ({ topic, partition, message }) => this.handle(topic, partition, message) })
      .catch((err: unknown) => {
        this.healthy = false;
        this.logger.error(`Order event consumer stopped: ${String(err)}`);
      });
  }

  async onApplicationShutdown(): Promise<void> {
    this.stopping = true;
    await this.consumer?.disconnect().catch(() => undefined);
  }

  /** Exposed for tests: what happens to one Kafka message. */
  async handle(topic: string, partition: number, message: { value: Buffer | null; offset: string }): Promise<void> {
    let event;
    try {
      event = orderEventSchema.parse(JSON.parse(message.value?.toString() ?? ''));
    } catch (err) {
      // A malformed event would block its partition forever; log it and move on.
      this.logger.error(`Skipping malformed event at ${topic}[${partition}]@${message.offset}: ${String(err)}`);
      return;
    }
    const messages = messagesFor(event);
    if (!messages.length) return;
    for (;;) {
      try {
        await this.inbox.record(event.id, new Date(event.occurredAt), messages);
        return;
      } catch (err) {
        if (this.stopping) throw err; // leave the offset uncommitted; the next run retries it
        this.logger.error(`Could not record event ${event.id}, retrying in ${RETRY_MS} ms: ${String(err)}`);
        await sleep(RETRY_MS);
      }
    }
  }
}
