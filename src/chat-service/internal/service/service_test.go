package service_test

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"slices"
	"testing"
	"time"

	"github.com/hassanshah0900/FoodKoala/src/chat-service/internal/chat"
	"github.com/hassanshah0900/FoodKoala/src/chat-service/internal/httpx"
	"github.com/hassanshah0900/FoodKoala/src/chat-service/internal/identity"
	"github.com/hassanshah0900/FoodKoala/src/chat-service/internal/service"
	"github.com/hassanshah0900/FoodKoala/src/chat-service/internal/testenv"
)

var now = time.Date(2026, 11, 11, 12, 0, 0, 0, time.UTC)

var (
	customer = identity.Identity{UserID: "c1", Roles: []string{"customer"}}
	rider    = identity.Identity{UserID: "r1", Roles: []string{"customer", "rider"}}
	admin    = identity.Identity{UserID: "a1", Roles: []string{"customer", "admin"}}
	stranger = identity.Identity{UserID: "x1", Roles: []string{"customer"}}
)

type setup struct {
	svc    service.Service
	repo   *testenv.Repo
	photos *testenv.Photos
	live   *testenv.Announced
}

func newSetup() setup {
	s := setup{repo: testenv.NewRepo(), photos: testenv.NewPhotos(), live: &testenv.Announced{}}
	s.svc = service.Service{Repo: s.repo, Photos: s.photos, Live: s.live, Now: func() time.Time { return now }}
	s.repo.Open("o1", "c1", "r1")
	return s
}

func status(t *testing.T, err error) int {
	t.Helper()
	var e *httpx.Error
	if !errors.As(err, &e) {
		t.Fatalf("want an httpx.Error, got %v", err)
	}
	return e.Status
}

func TestOnlyTheTwoSidesAndAdminsSeeTheChat(t *testing.T) {
	s := newSetup()
	ctx := context.Background()
	for _, who := range []identity.Identity{customer, rider, admin} {
		if _, err := s.svc.View(ctx, who, "o1"); err != nil {
			t.Fatalf("%s: %v", who.UserID, err)
		}
	}
	if _, err := s.svc.View(ctx, stranger, "o1"); status(t, err) != http.StatusNotFound {
		t.Fatal("a stranger gets 404")
	}
	if _, err := s.svc.View(ctx, customer, "nope"); status(t, err) != http.StatusNotFound {
		t.Fatal("no chat, 404")
	}
	v, _ := s.svc.View(ctx, rider, "o1")
	if v.Me != chat.Rider || !v.Open {
		t.Fatalf("got %+v", v)
	}
}

func TestSendingAndRetrying(t *testing.T) {
	s := newSetup()
	ctx := context.Background()
	m, created, err := s.svc.Send(ctx, customer, "o1", "client-0001", "  I'm at the gate ")
	if err != nil || !created || m.Text != "I'm at the gate" || m.From != chat.Customer || !m.SentAt.Equal(now) {
		t.Fatalf("got %+v %v %v", m, created, err)
	}
	again, created, err := s.svc.Send(ctx, customer, "o1", "client-0001", "I'm at the gate")
	if err != nil || created || again.ID != m.ID {
		t.Fatal("a retry returns the first message")
	}
	if got := s.live.Types(); !slices.Equal(got, []string{"message", "read"}) {
		t.Fatalf("announced %v", got)
	}
	v, _ := s.svc.View(ctx, rider, "o1")
	if len(v.Messages) != 1 || v.CustomerReadAt == nil || !v.CustomerReadAt.Equal(now) {
		t.Fatalf("got %+v", v)
	}
}

func TestWhoMayWrite(t *testing.T) {
	s := newSetup()
	ctx := context.Background()
	if _, _, err := s.svc.Send(ctx, admin, "o1", "client-0001", "hi"); status(t, err) != http.StatusForbidden {
		t.Fatal("admins only read")
	}
	if _, _, err := s.svc.Send(ctx, stranger, "o1", "client-0001", "hi"); status(t, err) != http.StatusNotFound {
		t.Fatal("strangers don't see it")
	}
	if _, _, err := s.svc.Send(ctx, rider, "o1", "client-0001", "   "); status(t, err) != http.StatusBadRequest {
		t.Fatal("empty message")
	}
	closed := now.Add(-time.Minute)
	s.repo.Chats["o1"].ClosesAt = &closed
	if _, _, err := s.svc.Send(ctx, rider, "o1", "client-0002", "hi"); status(t, err) != http.StatusConflict {
		t.Fatal("closed chat")
	}
}

func TestPhotos(t *testing.T) {
	s := newSetup()
	ctx := context.Background()
	m, created, err := s.svc.SendPhoto(ctx, rider, "o1", "client-photo1", "Left it at the gate", testenv.JPEG)
	if err != nil || !created || m.Photo == nil || m.Photo.ContentType != "image/jpeg" || m.Text != "Left it at the gate" {
		t.Fatalf("got %+v %v", m, err)
	}
	body, p, err := s.svc.Photo(ctx, customer, "o1", m.Photo.ID)
	if err != nil {
		t.Fatal(err)
	}
	b, _ := io.ReadAll(body)
	if len(b) != len(testenv.JPEG) || p.Key != "chats/o1/"+m.Photo.ID {
		t.Fatal("stored under the chat")
	}
	if _, _, err := s.svc.Photo(ctx, stranger, "o1", m.Photo.ID); status(t, err) != http.StatusNotFound {
		t.Fatal("only the chat sees its photos")
	}
	if _, _, err := s.svc.Photo(ctx, customer, "o1", testenv.NewID()); status(t, err) != http.StatusNotFound {
		t.Fatal("unknown photo")
	}
	if _, _, err := s.svc.SendPhoto(ctx, rider, "o1", "client-photo2", "", []byte("%PDF-1.7 not a picture")); status(t, err) != http.StatusBadRequest {
		t.Fatal("only pictures")
	}
	big := append(append([]byte{}, testenv.JPEG...), make([]byte, chat.MaxPhotoBytes)...)
	if _, _, err := s.svc.SendPhoto(ctx, rider, "o1", "client-photo3", "", big); status(t, err) != http.StatusRequestEntityTooLarge {
		t.Fatal("too big")
	}
	s.svc.Photos = nil
	if _, _, err := s.svc.SendPhoto(ctx, rider, "o1", "client-photo4", "", testenv.JPEG); status(t, err) != http.StatusServiceUnavailable {
		t.Fatal("photos turned off")
	}
}

func TestReadReceipts(t *testing.T) {
	s := newSetup()
	ctx := context.Background()
	if err := s.svc.Read(ctx, rider, "o1"); err != nil {
		t.Fatal(err)
	}
	if err := s.svc.Read(ctx, rider, "o1"); err != nil {
		t.Fatal(err)
	}
	if err := s.svc.Read(ctx, admin, "o1"); err != nil {
		t.Fatal(err)
	}
	if got := s.live.Types(); !slices.Equal(got, []string{"read"}) {
		t.Fatalf("one receipt for the rider, none for repeats or admins: %v", got)
	}
	if e := s.live.Events[0]; e.Role != chat.Rider || !e.ReadAt.Equal(now) {
		t.Fatalf("got %+v", e)
	}
}

func TestEventsOpenHandOverAndCloseTheChat(t *testing.T) {
	s := setup{repo: testenv.NewRepo(), live: &testenv.Announced{}}
	s.svc = service.Service{Repo: s.repo, Live: s.live, Now: func() time.Time { return now }}
	ctx := context.Background()
	apply := func(typ string, data map[string]any) {
		t.Helper()
		b, _ := json.Marshal(data)
		if err := s.svc.Apply(ctx, chat.Envelope{Type: typ, Data: b}); err != nil {
			t.Fatal(err)
		}
	}
	assigned := func(rider string, at time.Time) map[string]any {
		return map[string]any{"orderId": "o2", "customerId": "c1", "riderId": rider, "riderName": rider, "restaurantName": "Karahi Darbar", "at": at}
	}
	if _, err := s.svc.View(ctx, customer, "o2"); status(t, err) != http.StatusNotFound {
		t.Fatal("no chat before a rider")
	}
	apply("delivery.assigned", assigned("r1", now.Add(-10*time.Minute)))
	apply("delivery.assigned", assigned("r2", now.Add(-5*time.Minute)))
	apply("delivery.assigned", assigned("r1", now.Add(-10*time.Minute))) // replayed, older
	if _, err := s.svc.View(ctx, rider, "o2"); status(t, err) != http.StatusNotFound {
		t.Fatal("the first rider is out after the handover")
	}
	if v, err := s.svc.View(ctx, identity.Identity{UserID: "r2"}, "o2"); err != nil || v.Me != chat.Rider {
		t.Fatal("the new rider is in")
	}
	apply("order.status_changed", map[string]any{"orderId": "o2", "to": "accepted", "at": now})
	apply("delivery.delivered", map[string]any{"orderId": "o2", "riderId": "r2", "at": now.Add(-2 * time.Hour)})
	if v, _ := s.svc.View(ctx, customer, "o2"); v.Open {
		t.Fatal("closed an hour after delivery")
	}
	if got := s.live.Types(); !slices.Equal(got, []string{"changed", "changed", "changed"}) {
		t.Fatalf("sockets reload on each real change: %v", got)
	}
}
