import { Logger } from '@nestjs/common';
import { KafkaJS } from '@confluentinc/kafka-javascript';

/** One outbox row as a Kafka record. */
export interface OutgoingEvent {
  topic: string;
  key: string;
  /** JSON of the envelope. */
  value: string;
  headers: Record<string, string>;
}

/** Where the relay sends events. Resolves only once the broker has every record (acks=all). */
export interface EventPublisher {
  connect(): Promise<void>;
  publish(events: OutgoingEvent[]): Promise<void>;
  disconnect(): Promise<void>;
}

export const EVENT_PUBLISHER = Symbol('EVENT_PUBLISHER');

/**
 * Kafka producer with idempotence on: retries never duplicate or reorder
 * records within a partition, and the key (the order id) picks the
 * partition, so one order's events stay in sequence on each topic.
 */
export class KafkaPublisher implements EventPublisher {
  private readonly logger = new Logger(KafkaPublisher.name);
  private readonly producer: KafkaJS.Producer;

  constructor(brokers: string[], clientId: string) {
    const kafka = new KafkaJS.Kafka({ kafkaJS: { brokers, clientId, logLevel: KafkaJS.logLevel.WARN } });
    this.producer = kafka.producer({ kafkaJS: { idempotent: true, acks: -1 } });
  }

  async connect(): Promise<void> {
    await this.producer.connect();
    this.logger.log('Connected to Kafka');
  }

  async publish(events: OutgoingEvent[]): Promise<void> {
    const byTopic = new Map<string, KafkaJS.Message[]>();
    for (const e of events) {
      const messages = byTopic.get(e.topic) ?? [];
      messages.push({ key: e.key, value: e.value, headers: e.headers });
      byTopic.set(e.topic, messages);
    }
    await this.producer.sendBatch({ topicMessages: [...byTopic].map(([topic, messages]) => ({ topic, messages })) });
  }

  async disconnect(): Promise<void> {
    await this.producer.disconnect();
  }
}
