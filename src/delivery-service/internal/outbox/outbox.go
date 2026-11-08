// Package outbox writes events in the caller's transaction and publishes them to Kafka afterwards (ADR 0007).
package outbox

import (
	"context"
	"crypto/rand"
	"encoding/json"
	"fmt"
	"log/slog"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/twmb/franz-go/pkg/kgo"
)

// Envelope is contracts/README.md#event-envelope.
type Envelope struct {
	ID         string    `json:"id"`
	Type       string    `json:"type"`
	Version    int       `json:"version"`
	OccurredAt time.Time `json:"occurredAt"`
	Source     string    `json:"source"`
	Data       any       `json:"data"`
}

// NewID returns a random (version 4) UUID.
func NewID() string {
	var b [16]byte
	_, _ = rand.Read(b[:])
	b[6] = b[6]&0x0f | 0x40
	b[8] = b[8]&0x3f | 0x80
	return fmt.Sprintf("%x-%x-%x-%x-%x", b[0:4], b[4:6], b[6:8], b[8:10], b[10:16])
}

// Add writes an event of `topic` keyed by `key` inside tx, so it leaves only if tx commits.
func Add(ctx context.Context, tx pgx.Tx, topic, key string, at time.Time, data any) error {
	env := Envelope{ID: NewID(), Type: topic, Version: 1, OccurredAt: at.UTC(), Source: "delivery-service", Data: data}
	payload, err := json.Marshal(env)
	if err != nil {
		return err
	}
	_, err = tx.Exec(ctx, `INSERT INTO delivery.outbox (event_id, topic, key, payload) VALUES ($1, $2, $3, $4)`,
		env.ID, topic, key, payload)
	return err
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

// Relay publishes unpublished rows oldest first. One relay at a time holds a
// transaction-scoped advisory lock, so with several replicas events still
// leave in the order they were written. Rows are marked published only after
// the broker acknowledged them: a crash in between resends them.
type Relay struct {
	DB        *pgxpool.Pool
	Publisher Publisher
	Batch     int
	Every     time.Duration
}

// PublishBatch sends up to Batch events and returns how many went out.
func (r Relay) PublishBatch(ctx context.Context) (int, error) {
	sent := 0
	err := pgx.BeginFunc(ctx, r.DB, func(tx pgx.Tx) error {
		var locked bool
		if err := tx.QueryRow(ctx, `SELECT pg_try_advisory_xact_lock(hashtextextended('delivery.outbox', 0))`).Scan(&locked); err != nil || !locked {
			return err
		}
		rows, err := tx.Query(ctx, `SELECT id, event_id, topic, key, payload FROM delivery.outbox
			WHERE published_at IS NULL ORDER BY id LIMIT $1`, r.Batch)
		if err != nil {
			return err
		}
		var ids []int64
		var records []*kgo.Record
		for rows.Next() {
			var id int64
			var eventID, topic, key string
			var payload []byte
			if err := rows.Scan(&id, &eventID, &topic, &key, &payload); err != nil {
				return err
			}
			ids = append(ids, id)
			records = append(records, &kgo.Record{Topic: topic, Key: []byte(key), Value: payload, Headers: []kgo.RecordHeader{
				{Key: "event-id", Value: []byte(eventID)}, {Key: "event-type", Value: []byte(topic)},
			}})
		}
		if err := rows.Err(); err != nil || len(records) == 0 {
			return err
		}
		if err := r.Publisher.Publish(ctx, records); err != nil {
			return fmt.Errorf("publish: %w", err)
		}
		if _, err := tx.Exec(ctx, `UPDATE delivery.outbox SET published_at = now() WHERE id = ANY($1)`, ids); err != nil {
			return err
		}
		sent = len(records)
		return nil
	})
	return sent, err
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
			wait = min(r.Every<<min(failures, 6), 30*time.Second)
			slog.Error("publishing the outbox failed", "attempt", failures, "retry_in", wait, "err", err)
		case err == nil:
			failures = 0
			if sent == r.Batch {
				wait = 0
			}
		}
		select {
		case <-ctx.Done():
			return
		case <-time.After(wait):
		}
	}
}
