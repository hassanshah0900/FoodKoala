package chat

import (
	"encoding/json"
	"errors"
	"strings"
	"testing"
	"time"
)

var at = time.Date(2026, 11, 11, 12, 0, 0, 0, time.UTC)

func env(t *testing.T, typ string, data map[string]any) Envelope {
	t.Helper()
	b, err := json.Marshal(data)
	if err != nil {
		t.Fatal(err)
	}
	return Envelope{ID: "e1", Type: typ, Data: b}
}

func TestChangeOfAssignment(t *testing.T) {
	c, err := ChangeOf(env(t, "delivery.assigned", map[string]any{
		"orderId": "o1", "customerId": "c1", "riderId": "r1", "riderName": "Imran Ali",
		"restaurantName": "Karahi Darbar", "at": at,
	}))
	if err != nil {
		t.Fatal(err)
	}
	want := Assignment{CustomerID: "c1", RiderID: "r1", RiderName: "Imran Ali", RestaurantName: "Karahi Darbar", At: at}
	if c.OrderID != "o1" || c.Assign == nil || *c.Assign != want || c.ClosesAt != nil {
		t.Fatalf("got %+v", c)
	}
}

func TestChangeOfClosing(t *testing.T) {
	for _, e := range []Envelope{
		env(t, "delivery.delivered", map[string]any{"orderId": "o1", "riderId": "r1", "at": at}),
		env(t, "order.status_changed", map[string]any{"orderId": "o1", "to": "cancelled", "at": at}),
		env(t, "order.status_changed", map[string]any{"orderId": "o1", "to": "rejected", "at": at}),
	} {
		c, err := ChangeOf(e)
		if err != nil || c == nil || c.ClosesAt == nil || !c.ClosesAt.Equal(at.Add(Grace)) || c.Assign != nil {
			t.Fatalf("%s: got %+v, %v", e.Type, c, err)
		}
	}
}

func TestChangeOfIgnoresOtherSteps(t *testing.T) {
	c, err := ChangeOf(env(t, "order.status_changed", map[string]any{"orderId": "o1", "to": "accepted", "at": at}))
	if err != nil || c != nil {
		t.Fatalf("got %+v, %v", c, err)
	}
}

func TestChangeOfMalformed(t *testing.T) {
	for _, e := range []Envelope{
		{Type: "delivery.assigned", Data: []byte(`not json`)},
		env(t, "delivery.assigned", map[string]any{"orderId": "o1", "at": at}),
		env(t, "delivery.delivered", map[string]any{"riderId": "r1", "at": at}),
		env(t, "rider.location", map[string]any{"orderId": "o1", "at": at}),
	} {
		if _, err := ChangeOf(e); !errors.Is(err, ErrMalformed) {
			t.Fatalf("%s: want ErrMalformed, got %v", e.Type, err)
		}
	}
}

func TestRolesAndOpen(t *testing.T) {
	closes := at.Add(time.Hour)
	c := &Chat{OrderID: "o1", CustomerID: "c1", RiderID: "r1", ClosesAt: &closes}
	if c.RoleOf("c1") != Customer || c.RoleOf("r1") != Rider || c.RoleOf("x") != "" {
		t.Fatal("roles")
	}
	if !c.CanRead("x", true) || c.CanRead("x", false) {
		t.Fatal("admins read along, strangers don't")
	}
	if !c.Open(at) || c.Open(closes) {
		t.Fatal("open until it closes")
	}
	if (&Chat{CustomerID: "c1"}).Open(at) {
		t.Fatal("no rider, no chat")
	}
}

func TestCleanText(t *testing.T) {
	if got, err := CleanText("  I'm outside  ", false); err != nil || got != "I'm outside" {
		t.Fatalf("got %q, %v", got, err)
	}
	if _, err := CleanText("   ", false); err == nil {
		t.Fatal("empty text needs a photo")
	}
	if got, err := CleanText("", true); err != nil || got != "" {
		t.Fatal("a photo needs no caption")
	}
	var refusal Refusal
	if _, err := CleanText(strings.Repeat("ہ", MaxText+1), false); !errors.As(err, &refusal) {
		t.Fatalf("too long: %v", err)
	}
	if _, err := CleanText(strings.Repeat("ہ", MaxText), false); err != nil {
		t.Fatal("counts characters, not bytes")
	}
}

func TestPhotoType(t *testing.T) {
	if got, err := PhotoType("image/jpeg"); err != nil || got != "image/jpeg" {
		t.Fatal(err)
	}
	if _, err := PhotoType("application/pdf"); err == nil {
		t.Fatal("only pictures")
	}
}

func TestViewFor(t *testing.T) {
	c := &Chat{OrderID: "o1", CustomerID: "c1", RiderID: "r1"}
	v := ViewFor(c, nil, "r1", at)
	if v.Me != Rider || !v.Open || v.Messages == nil {
		t.Fatalf("got %+v", v)
	}
	b, _ := json.Marshal(v)
	if strings.Contains(string(b), "c1") || strings.Contains(string(b), "riderId") {
		t.Fatalf("user ids stay private: %s", b)
	}
}
