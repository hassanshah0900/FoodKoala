package consumer_test

import (
	"context"
	"errors"
	"testing"

	"github.com/hassanshah0900/FoodKoala/src/chat-service/internal/chat"
	"github.com/hassanshah0900/FoodKoala/src/chat-service/internal/consumer"
)

func TestDecodeRejectsWhatIsNotAnEnvelope(t *testing.T) {
	apply := consumer.Decode(func(context.Context, chat.Envelope) error { return nil })
	for _, raw := range []string{"junk", `{"id":"x"}`, `[]`} {
		if err := apply(context.Background(), []byte(raw)); !errors.Is(err, chat.ErrMalformed) {
			t.Errorf("%s: %v", raw, err)
		}
	}
	var got chat.Envelope
	apply = consumer.Decode(func(_ context.Context, e chat.Envelope) error { got = e; return nil })
	if err := apply(context.Background(), []byte(`{"id":"e1","type":"delivery.assigned","data":{}}`)); err != nil || got.Type != "delivery.assigned" {
		t.Fatalf("got %+v, %v", got, err)
	}
}
