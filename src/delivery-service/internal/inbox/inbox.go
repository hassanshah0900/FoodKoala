// Package inbox applies events from Kafka exactly once: it reads the envelope,
// records its id in delivery.processed_events and hands the data to the handler
// for its type, all in one transaction. A replayed event finds its id recorded
// and changes nothing.
package inbox

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"slices"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// ErrNotYet means the event depends on one not applied yet (e.g. a status change
// ahead of its order.placed, on another topic): retry it later.
var ErrNotYet = errors.New("event depends on one not applied yet")

// ErrMalformed means the event can never be applied; skip it so it doesn't block its partition.
var ErrMalformed = errors.New("malformed event")

// Handler applies one event's `data` inside the inbox's transaction.
type Handler func(ctx context.Context, tx pgx.Tx, data json.RawMessage) error

// Handlers maps an event type (which is also its topic) to its handler.
type Handlers map[string]Handler

// Merge combines the handlers of several packages; one type may only have one handler.
func Merge(all ...Handlers) Handlers {
	merged := Handlers{}
	for _, hs := range all {
		for typ, h := range hs {
			if _, taken := merged[typ]; taken {
				panic("inbox: two handlers for " + typ)
			}
			merged[typ] = h
		}
	}
	return merged
}

// Inbox applies events with the handler registered for their type.
type Inbox struct {
	DB       *pgxpool.Pool
	Handlers Handlers
}

// Topics are the event types with a handler, which is what to subscribe to.
func (i Inbox) Topics() []string {
	topics := make([]string, 0, len(i.Handlers))
	for t := range i.Handlers {
		topics = append(topics, t)
	}
	slices.Sort(topics)
	return topics
}

type envelope struct {
	ID   string          `json:"id"`
	Type string          `json:"type"`
	Data json.RawMessage `json:"data"`
}

// Apply applies one event in its own transaction, once per envelope id.
func (i Inbox) Apply(ctx context.Context, raw []byte) error {
	var env envelope
	if err := json.Unmarshal(raw, &env); err != nil || env.ID == "" {
		return fmt.Errorf("%w: %v", ErrMalformed, err)
	}
	handle, ok := i.Handlers[env.Type]
	if !ok {
		return fmt.Errorf("%w: type %q", ErrMalformed, env.Type)
	}
	return pgx.BeginFunc(ctx, i.DB, func(tx pgx.Tx) error {
		tag, err := tx.Exec(ctx, `INSERT INTO delivery.processed_events (event_id, type) VALUES ($1, $2) ON CONFLICT DO NOTHING`, env.ID, env.Type)
		if err != nil {
			return err
		}
		if tag.RowsAffected() == 0 {
			return nil // applied before
		}
		return handle(ctx, tx, env.Data)
	})
}

// Decode unmarshals an event's data into v, reporting failures as ErrMalformed.
func Decode(data json.RawMessage, v any) error {
	if err := json.Unmarshal(data, v); err != nil {
		return fmt.Errorf("%w: %v", ErrMalformed, err)
	}
	return nil
}
