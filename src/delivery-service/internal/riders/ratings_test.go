package riders_test

import (
	"context"
	"encoding/json"
	"testing"

	"github.com/hassanshah0900/FoodKoala/src/delivery-service/internal/identity"
	"github.com/hassanshah0900/FoodKoala/src/delivery-service/internal/inbox"
	"github.com/hassanshah0900/FoodKoala/src/delivery-service/internal/outbox"
	"github.com/hassanshah0900/FoodKoala/src/delivery-service/internal/riders"
	"github.com/hassanshah0900/FoodKoala/src/delivery-service/internal/testdb"
)

func reviewed(riderID any, rating any) []byte {
	b, _ := json.Marshal(map[string]any{"id": outbox.NewID(), "type": "order.reviewed", "version": 1, "data": map[string]any{
		"orderId": outbox.NewID(), "customerId": outbox.NewID(), "restaurantId": outbox.NewID(),
		"riderId": riderID, "restaurantRating": 5, "riderRating": rating, "comment": nil,
		"reviewedAt": "2026-11-10T10:00:00Z",
	}})
	return b
}

func TestCustomersRatingsMakeTheRidersAverage(t *testing.T) {
	pool := testdb.Open(t)
	ctx := context.Background()
	svc := riders.Service{DB: pool}
	in := inbox.Inbox{DB: pool, Handlers: svc.Handlers()}
	me := identity.Identity{UserID: outbox.NewID(), Phone: "+923001234567"}
	if _, err := svc.Apply(ctx, me, riders.Application{Name: "Asad", Vehicle: "motorbike", City: "Karachi"}); err != nil {
		t.Fatal(err)
	}
	r, _ := svc.Get(ctx, me.UserID)
	if r.Rating.Average != nil || r.Rating.Count != 0 {
		t.Fatalf("a new rider is unrated, got %+v", r.Rating)
	}

	five := reviewed(me.UserID, 5)
	for _, raw := range [][]byte{five, five, reviewed(me.UserID, 4), reviewed(me.UserID, 4), reviewed(me.UserID, nil), reviewed(nil, nil), reviewed(outbox.NewID(), 1)} {
		if err := in.Apply(ctx, raw); err != nil {
			t.Fatal(err)
		}
	}
	r, _ = svc.Get(ctx, me.UserID)
	// 5, 4, 4: the replayed five, the missing rating and other riders don't count.
	if r.Rating.Count != 3 || r.Rating.Average == nil || *r.Rating.Average != 4.3 {
		t.Fatalf("expected 4.3 from 3 ratings, got %+v (%v)", r.Rating, r.Rating.Average)
	}
}
