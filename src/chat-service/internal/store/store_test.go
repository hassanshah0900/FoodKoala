package store_test

import (
	"context"
	"testing"
	"time"

	"github.com/hassanshah0900/FoodKoala/src/chat-service/internal/chat"
	"github.com/hassanshah0900/FoodKoala/src/chat-service/internal/store"
	"github.com/hassanshah0900/FoodKoala/src/chat-service/internal/testenv"
)

var at = time.Date(2026, 11, 11, 12, 0, 0, 0, time.UTC)

func assign(order, rider string, when time.Time) chat.Change {
	return chat.Change{OrderID: order, Assign: &chat.Assignment{CustomerID: "c1", RiderID: rider, RiderName: rider, RestaurantName: "Karahi Darbar", At: when}}
}

func closing(order string, when time.Time) chat.Change {
	return chat.Change{OrderID: order, ClosesAt: &when}
}

// Against MongoDB: MONGO_URL=mongodb://localhost:27017 go test ./...
func TestEventsInAnyOrder(t *testing.T) {
	s := store.Store{DB: testenv.Mongo(t)}
	ctx := context.Background()
	if err := s.Migrate(ctx); err != nil {
		t.Fatal(err)
	}
	apply := func(c chat.Change, want bool) {
		t.Helper()
		got, err := s.Apply(ctx, c)
		if err != nil || got != want {
			t.Fatalf("%+v: changed %v (want %v), %v", c, got, want, err)
		}
	}
	o := testenv.NewID()
	apply(assign(o, "r1", at), true)
	apply(assign(o, "r1", at), false)                   // repeated
	apply(assign(o, "r2", at.Add(time.Minute)), true)   // handed over
	apply(assign(o, "r1", at.Add(-time.Minute)), false) // older, late
	apply(closing(o, at.Add(time.Hour)), true)
	apply(closing(o, at.Add(2*time.Hour)), false)    // closes once
	apply(assign(o, "r3", at.Add(time.Hour)), false) // never reopens
	c, err := s.Get(ctx, o)
	if err != nil || c.RiderID != "r2" || c.ClosesAt == nil || !c.ClosesAt.Equal(at.Add(time.Hour)) {
		t.Fatalf("got %+v, %v", c, err)
	}

	// Called off before any rider: a late assignment doesn't open it.
	early := testenv.NewID()
	apply(closing(early, at), true)
	apply(assign(early, "r1", at.Add(-time.Minute)), false)
	if c, _ := s.Get(ctx, early); c.Started() {
		t.Fatal("no chat for an order that ended first")
	}
	if c, _ := s.Get(ctx, testenv.NewID()); c != nil {
		t.Fatal("unknown order")
	}
}

func TestMessagesRetriesAndReadMarks(t *testing.T) {
	s := store.Store{DB: testenv.Mongo(t)}
	ctx := context.Background()
	if err := s.Migrate(ctx); err != nil {
		t.Fatal(err)
	}
	o := testenv.NewID()
	if _, err := s.Apply(ctx, assign(o, "r1", at)); err != nil {
		t.Fatal(err)
	}
	msg := func(i int, client string) chat.Message {
		return chat.Message{ID: testenv.NewID(), OrderID: o, SenderID: "c1", From: chat.Customer, ClientID: client,
			Text: "hi", SentAt: at.Add(time.Duration(i) * time.Second)}
	}
	first, created, err := s.Add(ctx, msg(1, "client-a"))
	if err != nil || !created {
		t.Fatal(err)
	}
	again, created, err := s.Add(ctx, msg(2, "client-a"))
	if err != nil || created || again.ID != first.ID {
		t.Fatalf("a retry finds the first: %+v %v", again, err)
	}
	photo := msg(3, "client-b")
	photo.Photo = &chat.Photo{ID: testenv.NewID(), Key: "chats/" + o + "/p", ContentType: "image/jpeg", Size: 10}
	if _, _, err := s.Add(ctx, photo); err != nil {
		t.Fatal(err)
	}
	msgs, err := s.Messages(ctx, o)
	if err != nil || len(msgs) != 2 || msgs[0].ID != first.ID || msgs[1].Photo == nil {
		t.Fatalf("oldest first: %+v %v", msgs, err)
	}
	if p, _ := s.Photo(ctx, o, photo.Photo.ID); p == nil || p.Key != photo.Photo.Key {
		t.Fatal("finds the photo")
	}
	if p, _ := s.Photo(ctx, testenv.NewID(), photo.Photo.ID); p != nil {
		t.Fatal("only in its own chat")
	}

	if moved, err := s.MarkRead(ctx, o, chat.Rider, at.Add(time.Minute)); err != nil || !moved {
		t.Fatal("moves forward")
	}
	if moved, _ := s.MarkRead(ctx, o, chat.Rider, at); moved {
		t.Fatal("never back")
	}
	c, _ := s.Get(ctx, o)
	if c.RiderReadAt == nil || !c.RiderReadAt.Equal(at.Add(time.Minute)) || c.CustomerReadAt != nil {
		t.Fatalf("got %+v", c)
	}
}
