import { randomUUID } from 'node:crypto';
import { KafkaJS } from '@confluentinc/kafka-javascript';
import { KafkaPublisher } from './outbox/publisher';

const brokers = process.env.KAFKA_BROKERS?.split(',');

// Needs a broker: KAFKA_BROKERS=localhost:9092 npm run test:e2e (make infra starts one).
describe.runIf(brokers)('KafkaPublisher against a real broker (e2e)', () => {
  it('delivers records with their key and headers, in order per key', async () => {
    const topic = `test.outbox.${randomUUID()}`;
    const kafka = new KafkaJS.Kafka({ kafkaJS: { brokers: brokers!, logLevel: KafkaJS.logLevel.NOTHING } });
    const admin = kafka.admin();
    await admin.connect();
    await admin.createTopics({ topics: [{ topic, numPartitions: 3 }] });

    const publisher = new KafkaPublisher(brokers!, 'order-service-test');
    await publisher.connect();
    const orderId = randomUUID();
    await publisher.publish(
      ['placed', 'accepted', 'ready'].map((to, i) => ({
        topic,
        key: orderId,
        value: JSON.stringify({ id: `e${i}`, data: { to } }),
        headers: { 'event-id': `e${i}`, 'event-type': 'order.status_changed' },
      })),
    );
    await publisher.disconnect();

    const consumer = kafka.consumer({ kafkaJS: { groupId: `test-${randomUUID()}`, fromBeginning: true } });
    await consumer.connect();
    await consumer.subscribe({ topic });
    const seen: { key: string; to: string; eventId: string; partition: number }[] = [];
    await consumer.run({
      eachMessage: async ({ message, partition }) => {
        seen.push({
          key: message.key!.toString(),
          to: JSON.parse(message.value!.toString()).data.to,
          eventId: String(message.headers!['event-id']),
          partition,
        });
      },
    });
    await vi.waitFor(() => expect(seen).toHaveLength(3), { timeout: 30_000, interval: 200 });
    await consumer.disconnect();
    await admin.deleteTopics({ topics: [topic] });
    await admin.disconnect();

    expect(seen.map((s) => s.to)).toEqual(['placed', 'accepted', 'ready']);
    expect(new Set(seen.map((s) => s.partition)).size).toBe(1);
    expect(seen.every((s) => s.key === orderId)).toBe(true);
    expect(seen.map((s) => s.eventId)).toEqual(['e0', 'e1', 'e2']);
  }, 60_000);
});
