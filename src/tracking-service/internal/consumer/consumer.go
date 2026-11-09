// Package consumer reads order, delivery and rider events from Kafka and hands them to the store.
package consumer

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"sync/atomic"
	"time"

	"github.com/twmb/franz-go/pkg/kgo"

	"github.com/hassanshah0900/FoodKoala/src/tracking-service/internal/tracking"
)

// Applier applies one record's value (store.Store.Apply behind Decode).
type Applier func(ctx context.Context, raw []byte) error

// Consumer commits a record's offset only after it was applied. A record that
// failed (Redis down) stops its partition: the partition is rewound to it and
// retried after a pause, while other partitions carry on. Malformed records are
// logged and skipped.
type Consumer struct {
	Client *kgo.Client
	Apply  Applier
	Retry  time.Duration
	alive  atomic.Bool
}

// New builds a consumer group client with manual commits.
func New(brokers []string, group string, topics []string, apply Applier) (*Consumer, error) {
	client, err := kgo.NewClient(
		kgo.SeedBrokers(brokers...),
		kgo.ConsumerGroup(group),
		kgo.ConsumeTopics(topics...),
		kgo.DisableAutoCommit(),
		kgo.ConsumeResetOffset(kgo.NewOffset().AtStart()),
		// Notice topics created after we subscribed within seconds.
		kgo.MetadataMaxAge(5*time.Second),
	)
	if err != nil {
		return nil, err
	}
	return &Consumer{Client: client, Apply: apply, Retry: time.Second}, nil
}

// Alive is false once Run has returned; for /readyz.
func (c *Consumer) Alive() bool { return c.alive.Load() }

// Run consumes until ctx ends.
func (c *Consumer) Run(ctx context.Context) {
	c.alive.Store(true)
	defer c.alive.Store(false)
	for ctx.Err() == nil {
		fetches := c.Client.PollFetches(ctx)
		if ctx.Err() != nil || fetches.IsClientClosed() {
			return
		}
		fetches.EachError(func(topic string, partition int32, err error) {
			slog.Warn("kafka fetch", "topic", topic, "partition", partition, "err", err)
		})
		if c.ProcessFetches(ctx, fetches) {
			select {
			case <-ctx.Done():
			case <-time.After(c.Retry):
			}
		}
	}
}

// ProcessFetches applies what was fetched and commits it; true when some partition must be retried.
func (c *Consumer) ProcessFetches(ctx context.Context, fetches kgo.Fetches) bool {
	var done []*kgo.Record
	rewind := map[string]map[int32]kgo.EpochOffset{}
	fetches.EachPartition(func(p kgo.FetchTopicPartition) {
		for _, r := range p.Records {
			err := c.Apply(ctx, r.Value)
			switch {
			case err == nil:
			case errors.Is(err, tracking.ErrMalformed):
				slog.Error("skipping malformed event", "topic", r.Topic, "partition", r.Partition, "offset", r.Offset, "err", err)
			default:
				slog.Error("could not apply event; retrying", "topic", r.Topic, "offset", r.Offset, "err", err)
				if rewind[p.Topic] == nil {
					rewind[p.Topic] = map[int32]kgo.EpochOffset{}
				}
				rewind[p.Topic][p.Partition] = kgo.EpochOffset{Epoch: r.LeaderEpoch, Offset: r.Offset}
				return // later records of this partition wait their turn
			}
			done = append(done, r)
		}
	})
	if len(done) > 0 {
		if err := c.Client.CommitRecords(ctx, done...); err != nil && ctx.Err() == nil {
			slog.Error("committing offsets failed", "err", err) // the records come again and are no-ops
		}
	}
	if len(rewind) > 0 {
		c.Client.SetOffsets(rewind)
		return true
	}
	return false
}

// Decode adapts an envelope applier to raw records.
func Decode(apply func(context.Context, tracking.Envelope) error) Applier {
	return func(ctx context.Context, raw []byte) error {
		var env tracking.Envelope
		if err := json.Unmarshal(raw, &env); err != nil || env.Type == "" {
			return fmt.Errorf("%w: not an event envelope", tracking.ErrMalformed)
		}
		return apply(ctx, env)
	}
}
