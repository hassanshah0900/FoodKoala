// Package outbox holds the events chat-service publishes until Kafka has them (ADR 0007). They are
// written to MongoDB first and sent by the Relay, so an event is never lost between the two.
package outbox

import (
	"context"
	"crypto/sha1"
	"encoding/json"
	"fmt"
	"log/slog"
	"time"

	"github.com/twmb/franz-go/pkg/kgo"
)

// Event is an event waiting to be published, or already published.
type Event struct {
	ID          string     `bson:"_id"`
	Topic       string     `bson:"topic"`
	Key         string     `bson:"key"`
	Payload     []byte     `bson:"payload"`
	CreatedAt   time.Time  `bson:"createdAt"`
	PublishedAt *time.Time `bson:"publishedAt,omitempty"`
}

// Envelope is contracts/README.md#event-envelope.
type Envelope struct {
	ID         string    `json:"id"`
	Type       string    `json:"type"`
	Version    int       `json:"version"`
	OccurredAt time.Time `json:"occurredAt"`
	Source     string    `json:"source"`
	Data       any       `json:"data"`
}

// New wraps data in an envelope of `topic`, with the given id: callers make it from what the event
// is about, so writing the same event twice collides instead of sending it twice.
func New(id, topic, key string, at time.Time, data any) (Event, error) {
	payload, err := json.Marshal(Envelope{ID: id, Type: topic, Version: 1, OccurredAt: at.UTC(), Source: "chat-service", Data: data})
	if err != nil {
		return Event{}, err
	}
	return Event{ID: id, Topic: topic, Key: key, Payload: payload, CreatedAt: at.UTC()}, nil
}

// StableID is a UUID (version 5 layout) made from the parts: the same parts give the same id.
func StableID(parts ...string) string {
	h := sha1.New()
	for _, p := range parts {
		h.Write([]byte(p))
		h.Write([]byte{0})
	}
	b := h.Sum(nil)[:16]
	b[6] = b[6]&0x0f | 0x50
	b[8] = b[8]&0x3f | 0x80
	return fmt.Sprintf("%x-%x-%x-%x-%x", b[0:4], b[4:6], b[6:8], b[8:10], b[10:16])
}

// Store reads and marks the outbox (store.Store).
type Store interface {
	Unpublished(ctx context.Context, limit int) ([]Event, error)
	MarkPublished(ctx context.Context, ids []string, at time.Time) error
}

// Publisher sends records and returns once the broker has all of them.
type Publisher interface {
	Publish(ctx context.Context, records []*kgo.Record) error
}

// KafkaPublisher is franz-go's producer: idempotent with acks=all by default.
type KafkaPublisher struct{ Client *kgo.Client }

func (p KafkaPublisher) Publish(ctx context.Context, records []*kgo.Record) error {
	return p.Client.ProduceSync(ctx, records...).FirstErr()
}

// Relay publishes unpublished events oldest first and marks them only after the broker has them,
// so a crash in between sends them again. Several replicas may send the same event: consumers
// already treat events as at-least-once and drop repeats by envelope id.
type Relay struct {
	Store     Store
	Publisher Publisher
	Batch     int
	Every     time.Duration
}

// PublishBatch sends up to Batch events and returns how many went out.
func (r Relay) PublishBatch(ctx context.Context) (int, error) {
	events, err := r.Store.Unpublished(ctx, r.Batch)
	if err != nil || len(events) == 0 {
		return 0, err
	}
	records := make([]*kgo.Record, len(events))
	ids := make([]string, len(events))
	for i, e := range events {
		ids[i] = e.ID
		records[i] = &kgo.Record{Topic: e.Topic, Key: []byte(e.Key), Value: e.Payload, Headers: []kgo.RecordHeader{
			{Key: "event-id", Value: []byte(e.ID)}, {Key: "event-type", Value: []byte(e.Topic)},
		}}
	}
	if err := r.Publisher.Publish(ctx, records); err != nil {
		return 0, fmt.Errorf("publish: %w", err)
	}
	return len(events), r.Store.MarkPublished(ctx, ids, time.Now().UTC())
}

// Run publishes until ctx ends, backing off up to 30 s while Kafka is down.
func (r Relay) Run(ctx context.Context) {
	failures := 0
	for {
		wait := r.Every
		sent, err := r.PublishBatch(ctx)
		switch {
		case err != nil && ctx.Err() == nil:
			failures++
			wait = min(r.Every<<min(failures, 5), 30*time.Second)
			slog.Warn("publishing chat events failed", "err", err, "retry_in", wait)
		case sent == r.Batch:
			failures, wait = 0, 0 // more may be waiting
		default:
			failures = 0
		}
		select {
		case <-ctx.Done():
			return
		case <-time.After(wait):
		}
	}
}
