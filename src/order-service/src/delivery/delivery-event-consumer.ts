import { setTimeout as sleep } from 'node:timers/promises';
import { KafkaJS } from '@confluentinc/kafka-javascript';
import { Inject, Injectable, Logger, type OnApplicationBootstrap, type OnApplicationShutdown } from '@nestjs/common';
import { z } from 'zod';
import { APP_CONFIG, type AppConfig } from '../config/config';
import { OrdersService } from '../orders/orders.service';

export const DELIVERY_TOPICS = ['delivery.picked_up', 'delivery.delivered'];
const RETRY_MS = 5000;

/** contracts/events/delivery.picked_up and delivery.delivered, the fields we use. */
const deliveryEventSchema = z.object({
  id: z.uuid(),
  type: z.enum(['delivery.picked_up', 'delivery.delivered']),
  data: z.object({ orderId: z.uuid(), riderId: z.uuid(), at: z.iso.datetime({ offset: true }) }),
});

/**
 * Moves orders along when delivery-service reports a rider's pickup or
 * drop-off. Applying an event twice changes nothing (the order has already
 * moved), so at-least-once delivery is safe. While Postgres is down the same
 * event is retried; a malformed one is logged and skipped.
 */
@Injectable()
export class DeliveryEventConsumer implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(DeliveryEventConsumer.name);
  private consumer: KafkaJS.Consumer | undefined;
  private stopping = false;

  /** Running (or not configured); false once it has crashed. For /readyz. */
  healthy = true;

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly orders: OrdersService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    if (!this.config.KAFKA_BROKERS) return; // the outbox relay already warns that Kafka is off
    const kafka = new KafkaJS.Kafka({
      kafkaJS: {
        brokers: this.config.KAFKA_BROKERS,
        clientId: this.config.KAFKA_CLIENT_ID,
        logLevel: KafkaJS.logLevel.WARN,
      },
    });
    this.consumer = kafka.consumer({
      kafkaJS: { groupId: this.config.KAFKA_GROUP_ID, fromBeginning: true },
      // Notice topics created after we subscribed within seconds, not the default five minutes.
      'topic.metadata.refresh.interval.ms': 5000,
    });
    await this.consumer.connect();
    await this.consumer.subscribe({ topics: DELIVERY_TOPICS });
    void this.consumer
      .run({ eachMessage: async ({ topic, partition, message }) => this.handle(topic, partition, message) })
      .catch((err: unknown) => {
        this.healthy = false;
        this.logger.error(`Delivery event consumer stopped: ${String(err)}`);
      });
  }

  async onApplicationShutdown(): Promise<void> {
    this.stopping = true;
    await this.consumer?.disconnect().catch(() => undefined);
  }

  /** Exposed for tests: what happens to one Kafka message. */
  async handle(topic: string, partition: number, message: { value: Buffer | null; offset: string }): Promise<void> {
    let event: z.infer<typeof deliveryEventSchema>;
    try {
      event = deliveryEventSchema.parse(JSON.parse(message.value?.toString() ?? ''));
    } catch (err) {
      this.logger.error(`Skipping malformed event at ${topic}[${partition}]@${message.offset}: ${String(err)}`);
      return;
    }
    const to = event.type === 'delivery.picked_up' ? 'picked_up' : 'delivered';
    for (;;) {
      try {
        const applied = await this.orders.applyRiderEvent(
          event.data.orderId,
          to,
          event.data.riderId,
          new Date(event.data.at),
        );
        if (!applied) this.logger.log(`Nothing to do for ${event.type} of order ${event.data.orderId}`);
        return;
      } catch (err) {
        if (this.stopping) throw err; // leave the offset uncommitted; the next run retries it
        this.logger.error(`Could not apply event ${event.id}, retrying in ${RETRY_MS} ms: ${String(err)}`);
        await sleep(RETRY_MS);
      }
    }
  }
}
