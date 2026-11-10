// Package store keeps each order's tracking in Redis and announces every change on
// a Redis channel, so any replica's WebSockets hear it whichever replica applied it.
package store

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/redis/go-redis/v9"

	"github.com/hassanshah0900/FoodKoala/src/tracking-service/internal/tracking"
)

// How long tracking is kept: a day while under way, two hours once finished.
const (
	ActiveTTL   = 24 * time.Hour
	FinishedTTL = 2 * time.Hour
)

func key(orderID string) string { return "tracking:order:" + orderID }

// Channel is where the order's changes are published, each a tracking.View as JSON.
func Channel(orderID string) string { return "tracking:live:" + orderID }

type Store struct {
	Redis *redis.Client
	Now   func() time.Time
}

func (s Store) now() time.Time {
	if s.Now != nil {
		return s.Now()
	}
	return time.Now()
}

// Get returns the order's tracking, or nil when there is none.
func (s Store) Get(ctx context.Context, orderID string) (*tracking.State, error) {
	raw, err := s.Redis.Get(ctx, key(orderID)).Bytes()
	if errors.Is(err, redis.Nil) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	var st tracking.State
	if err := json.Unmarshal(raw, &st); err != nil {
		return nil, fmt.Errorf("tracking of %s: %w", orderID, err)
	}
	return &st, nil
}

// Apply folds one event into its order's tracking. Events of an order come from
// several topics, which may be read by different replicas at once, so the update
// is optimistic: WATCH, read, change, write in MULTI, and start over if another
// writer got in between. Saved changes are published in the same transaction.
func (s Store) Apply(ctx context.Context, env tracking.Envelope) error {
	orderID, err := tracking.OrderID(env)
	if err != nil {
		return err
	}
	k := key(orderID)
	for range 20 {
		err = s.Redis.Watch(ctx, func(tx *redis.Tx) error {
			before, err := tx.Get(ctx, k).Bytes()
			if err != nil && !errors.Is(err, redis.Nil) {
				return err
			}
			st := tracking.New(orderID)
			if before != nil {
				if err := json.Unmarshal(before, st); err != nil {
					return fmt.Errorf("tracking of %s: %w", orderID, err)
				}
			}
			if err := st.Apply(env); err != nil {
				return err
			}
			// Compare without the bookkeeping, so a repeated event changes nothing.
			unchanged := before != nil && sameAsBefore(before, st)
			if unchanged {
				return nil
			}
			st.Version++
			st.UpdatedAt = s.now().UTC()
			after, err := json.Marshal(st)
			if err != nil {
				return err
			}
			view, err := json.Marshal(st.View)
			if err != nil {
				return err
			}
			ttl := ActiveTTL
			if st.Finished() {
				ttl = FinishedTTL
			}
			_, err = tx.TxPipelined(ctx, func(p redis.Pipeliner) error {
				p.Set(ctx, k, after, ttl)
				p.Publish(ctx, Channel(orderID), view)
				return nil
			})
			return err
		}, k)
		if !errors.Is(err, redis.TxFailedErr) {
			return err
		}
	}
	return fmt.Errorf("tracking of %s kept changing: %w", orderID, err)
}

func sameAsBefore(before []byte, st *tracking.State) bool {
	var old tracking.State
	if json.Unmarshal(before, &old) != nil {
		return false
	}
	old.Version, old.UpdatedAt = st.Version, st.UpdatedAt
	a, _ := json.Marshal(old)
	b, _ := json.Marshal(st)
	return string(a) == string(b)
}
