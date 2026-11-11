package chat

import (
	"encoding/json"
	"errors"
	"strings"
	"testing"
	"time"
	"unicode/utf8"
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

func TestDue(t *testing.T) {
	c := &Chat{OrderID: "o1", CustomerID: "c1", RiderID: "r1",
		CustomerWaiting: &Waiting{Since: at}, RiderWaiting: &Waiting{Since: at.Add(30 * time.Second)}}
	if got := c.Due(at.Add(59 * time.Second)); len(got) != 0 {
		t.Fatalf("nobody waited a minute yet: %v", got)
	}
	if got := c.Due(at.Add(NudgeAfter)); len(got) != 1 || got[0] != Customer {
		t.Fatalf("the customer is due: %v", got)
	}
	if got := c.Due(at.Add(2 * time.Minute)); len(got) != 2 {
		t.Fatalf("both are due: %v", got)
	}
	c.CustomerWaiting.Nudged = true
	if got := c.Due(at.Add(2 * time.Minute)); len(got) != 1 || got[0] != Rider {
		t.Fatalf("told once: %v", got)
	}
	closed := at
	c.ClosesAt = &closed
	if got := c.Due(at.Add(2 * time.Minute)); len(got) != 0 {
		t.Fatal("not after the chat closed")
	}
}

func TestNudgeFor(t *testing.T) {
	c := &Chat{OrderID: "o1", CustomerID: "c1", CustomerPhone: "+923000000023", RiderID: "r1", RiderPhone: "+923000000031",
		RiderName: "Imran Ali", RestaurantName: "Karahi Darbar", CustomerWaiting: &Waiting{Since: at}}
	msgs := []Message{
		{From: Rider, Text: "old, read already", SentAt: at.Add(-time.Minute)},
		{From: Customer, Text: "mine", SentAt: at.Add(time.Second)},
		{From: Rider, Text: "Two minutes away", SentAt: at},
		{From: Rider, Text: strings.Repeat("a", 100), Photo: &Photo{ID: "p1"}, SentAt: at.Add(2 * time.Second)},
	}
	n := c.NudgeFor(Customer, msgs)
	if n == nil || n.RecipientID != "c1" || n.RecipientPhone != "+923000000023" || n.SenderRole != Rider ||
		n.SenderName == nil || *n.SenderName != "Imran Ali" || n.Unread != 2 || !n.Photo || !n.Since.Equal(at) {
		t.Fatalf("got %+v", n)
	}
	if utf8.RuneCountInString(n.Preview) != NudgePreview || !strings.HasSuffix(n.Preview, "…") {
		t.Fatalf("preview cut to %d: %q", NudgePreview, n.Preview)
	}
	c.RiderWaiting = &Waiting{Since: at}
	if r := c.NudgeFor(Rider, msgs); r == nil || r.SenderName != nil || r.Preview != "mine" || r.Unread != 1 {
		t.Fatalf("riders don't learn the customer's name: %+v", r)
	}
	if (&Chat{CustomerID: "c1", CustomerWaiting: &Waiting{Since: at}}).NudgeFor(Customer, msgs) != nil {
		t.Fatal("no phone, nothing to send")
	}
}
