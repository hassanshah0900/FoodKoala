package inbox_test

import (
	"context"
	"encoding/json"
	"errors"
	"slices"
	"testing"

	"github.com/jackc/pgx/v5"

	"github.com/hassanshah0900/FoodKoala/src/delivery-service/internal/inbox"
)

func noop(context.Context, pgx.Tx, json.RawMessage) error { return nil }

func TestTopicsAreTheHandledTypes(t *testing.T) {
	in := inbox.Inbox{Handlers: inbox.Merge(
		inbox.Handlers{"order.status_changed": noop, "order.placed": noop},
		inbox.Handlers{"order.reviewed": noop},
	)}
	if got := in.Topics(); !slices.Equal(got, []string{"order.placed", "order.reviewed", "order.status_changed"}) {
		t.Fatalf("topics: %v", got)
	}
}

func TestMergeRefusesTwoHandlersForOneType(t *testing.T) {
	defer func() {
		if recover() == nil {
			t.Fatal("expected a panic")
		}
	}()
	inbox.Merge(inbox.Handlers{"order.placed": noop}, inbox.Handlers{"order.placed": noop})
}

func TestMalformedAndUnknownEventsNeverReachTheDatabase(t *testing.T) {
	in := inbox.Inbox{Handlers: inbox.Handlers{"order.placed": noop}} // no DB: it must not be used
	for _, raw := range []string{`not json`, `{"type":"order.placed"}`, `{"id":"e1","type":"order.eaten","data":{}}`} {
		if err := in.Apply(context.Background(), []byte(raw)); !errors.Is(err, inbox.ErrMalformed) {
			t.Fatalf("%s: expected ErrMalformed, got %v", raw, err)
		}
	}
}
