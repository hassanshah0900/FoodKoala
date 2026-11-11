package outbox

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/twmb/franz-go/pkg/kgo"
)

func TestStableID(t *testing.T) {
	a := StableID("chat.message_waiting", "o1", "customer", "2026-11-11T12:00:00Z")
	if a != StableID("chat.message_waiting", "o1", "customer", "2026-11-11T12:00:00Z") {
		t.Fatal("same parts, same id")
	}
	if a == StableID("chat.message_waiting", "o1", "rider", "2026-11-11T12:00:00Z") {
		t.Fatal("other parts, other id")
	}
	if len(a) != 36 || a[14] != '5' {
		t.Fatalf("a version 5 UUID: %s", a)
	}
}

type memStore struct {
	events    []Event
	published []string
}

func (m *memStore) Unpublished(_ context.Context, limit int) ([]Event, error) {
	var out []Event
	for _, e := range m.events {
		if e.PublishedAt == nil && len(out) < limit {
			out = append(out, e)
		}
	}
	return out, nil
}

func (m *memStore) MarkPublished(_ context.Context, ids []string, at time.Time) error {
	for i := range m.events {
		for _, id := range ids {
			if m.events[i].ID == id {
				m.events[i].PublishedAt = &at
			}
		}
	}
	m.published = append(m.published, ids...)
	return nil
}

type publisher struct {
	fail bool
	sent []*kgo.Record
}

func (p *publisher) Publish(_ context.Context, records []*kgo.Record) error {
	if p.fail {
		return errors.New("broker down")
	}
	p.sent = append(p.sent, records...)
	return nil
}

func TestRelay(t *testing.T) {
	e1, _ := New("id-1", "chat.message_waiting", "o1", time.Now(), map[string]string{"a": "b"})
	e2, _ := New("id-2", "chat.message_waiting", "o2", time.Now(), map[string]string{"a": "c"})
	store := &memStore{events: []Event{e1, e2}}
	down := &publisher{fail: true}
	r := Relay{Store: store, Publisher: down, Batch: 10}
	if _, err := r.PublishBatch(context.Background()); err == nil || len(store.published) != 0 {
		t.Fatal("nothing is marked while the broker is down")
	}
	up := &publisher{}
	r.Publisher = up
	if n, err := r.PublishBatch(context.Background()); err != nil || n != 2 {
		t.Fatalf("sent %d, %v", n, err)
	}
	if string(up.sent[0].Key) != "o1" || up.sent[0].Topic != "chat.message_waiting" || string(up.sent[0].Headers[0].Value) != "id-1" {
		t.Fatalf("got %+v", up.sent[0])
	}
	if n, _ := r.PublishBatch(context.Background()); n != 0 {
		t.Fatal("published once")
	}
}
