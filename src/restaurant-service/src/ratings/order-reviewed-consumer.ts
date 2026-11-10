import { setTimeout as sleep } from 'node:timers/promises';
import { KafkaJS } from '@confluentinc/kafka-javascript';
import { Inject, Injectable, Logger, type OnApplicationBootstrap, type OnApplicationShutdown } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../config/config';
import { ORDER_REVIEWED, type OrderReviewed, orderReviewedSchema } from './order-reviewed';
import { RatingsService } from './ratings.service';

const RETRY_MS = 5000;

/**
 * Reads order.reviewed into restaurant ratings. Recording a review twice
 * changes nothing, so at-least-once delivery is safe. While Postgres is down
 * the same event is retried; a malformed one is logged and skipped.
 */
@Injectable()
export class OrderReviewedConsumer implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(OrderReviewedConsumer.name);
  private consumer: KafkaJS.Consumer | undefined;
  private stopping = false;

  /** Running (or not configured); false once it has crashed. For /readyz. */
  healthy = true;

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly ratings: RatingsService,
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
    await this.consumer.subscribe({ topics: [ORDER_REVIEWED] });
    void this.consumer
      .run({ eachMessage: async ({ topic, partition, message }) => this.handle(topic, partition, message) })
      .catch((err: unknown) => {
        this.healthy = false;
        this.logger.error(`order.reviewed consumer stopped: ${String(err)}`);
      });
  }

  async onApplicationShutdown(): Promise<void> {
    this.stopping = true;
    await this.consumer?.disconnect().catch(() => undefined);
  }

  /** Exposed for tests: what happens to one Kafka message. */
  async handle(topic: string, partition: number, message: { value: Buffer | null; offset: string }): Promise<void> {
    let review: OrderReviewed;
    try {
      review = orderReviewedSchema.parse(JSON.parse(message.value?.toString() ?? '')).data;
    } catch (err) {
      this.logger.error(`Skipping malformed event at ${topic}[${partition}]@${message.offset}: ${String(err)}`);
      return;
    }
    for (;;) {
      try {
        if (!(await this.ratings.record(review))) {
          this.logger.log(`Review of order ${review.orderId} was recorded before or its restaurant is unknown`);
        }
        return;
      } catch (err) {
        if (this.stopping) throw err; // leave the offset uncommitted; the next run retries it
        this.logger.error(
          `Could not record the review of order ${review.orderId}, retrying in ${RETRY_MS} ms: ${String(err)}`,
        );
        await sleep(RETRY_MS);
      }
    }
  }
}
