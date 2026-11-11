// Package testenv has what the tests share: in-memory stand-ins for the store, photo storage and
// live announcements, and connections to the real ones for integration tests (skipped without them).
package testenv

import (
	"bytes"
	"context"
	"crypto/rand"
	"fmt"
	"io"
	"os"
	"slices"
	"sync"
	"testing"
	"time"

	"github.com/redis/go-redis/v9"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"

	"github.com/hassanshah0900/FoodKoala/src/chat-service/internal/chat"
	"github.com/hassanshah0900/FoodKoala/src/chat-service/internal/outbox"
)

// NewID returns a random (version 4) UUID.
func NewID() string {
	var b [16]byte
	_, _ = rand.Read(b[:])
	b[6] = b[6]&0x0f | 0x40
	b[8] = b[8]&0x3f | 0x80
	return fmt.Sprintf("%x-%x-%x-%x-%x", b[0:4], b[4:6], b[6:8], b[8:10], b[10:16])
}

// Repo keeps chats and messages in memory, with the store's rules for assignments and retries.
type Repo struct {
	mu     sync.Mutex
	Chats  map[string]*chat.Chat
	Msgs   []chat.Message
	Outbox []outbox.Event
}

func NewRepo() *Repo { return &Repo{Chats: map[string]*chat.Chat{}} }

// Open puts an open chat between a customer and a rider.
func (r *Repo) Open(orderID, customerID, riderID string) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.Chats[orderID] = &chat.Chat{OrderID: orderID, CustomerID: customerID, RiderID: riderID, RiderName: "Imran Ali",
		RestaurantName: "Karahi Darbar", CustomerPhone: "+923000000023", RiderPhone: "+923000000031"}
}

func (r *Repo) waiting(c *chat.Chat, role string) **chat.Waiting {
	if role == chat.Rider {
		return &c.RiderWaiting
	}
	return &c.CustomerWaiting
}

func (r *Repo) Waiting(_ context.Context, orderID, role string, at time.Time) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	if c := r.Chats[orderID]; c != nil && *r.waiting(c, role) == nil {
		*r.waiting(c, role) = &chat.Waiting{Since: at}
	}
	return nil
}

func (r *Repo) Due(_ context.Context, cutoff time.Time) ([]chat.Chat, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	var due []chat.Chat
	for _, c := range r.Chats {
		for _, w := range []*chat.Waiting{c.CustomerWaiting, c.RiderWaiting} {
			if w != nil && !w.Nudged && !w.Since.After(cutoff) {
				cp := *c
				due = append(due, cp)
				break
			}
		}
	}
	return due, nil
}

func (r *Repo) Nudged(_ context.Context, orderID, role string, since time.Time, event *outbox.Event) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	if event != nil && !slices.ContainsFunc(r.Outbox, func(e outbox.Event) bool { return e.ID == event.ID }) {
		r.Outbox = append(r.Outbox, *event)
	}
	if c := r.Chats[orderID]; c != nil {
		if w := *r.waiting(c, role); w != nil && w.Since.Equal(since) {
			w.Nudged = true
		}
	}
	return nil
}

func (r *Repo) Apply(_ context.Context, c chat.Change) (bool, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	cur := r.Chats[c.OrderID]
	switch {
	case c.Assign != nil:
		if cur != nil && (cur.ClosesAt != nil || !cur.AssignedAt.Before(c.Assign.At)) {
			return false, nil
		}
		a := c.Assign
		r.Chats[c.OrderID] = &chat.Chat{OrderID: c.OrderID, CustomerID: a.CustomerID, RiderID: a.RiderID,
			RiderName: a.RiderName, RestaurantName: a.RestaurantName, AssignedAt: a.At}
		return true, nil
	case c.ClosesAt != nil:
		if cur == nil {
			cur = &chat.Chat{OrderID: c.OrderID}
			r.Chats[c.OrderID] = cur
		} else if cur.ClosesAt != nil {
			return false, nil
		}
		at := *c.ClosesAt
		cur.ClosesAt = &at
		return true, nil
	}
	return false, nil
}

func (r *Repo) Get(_ context.Context, orderID string) (*chat.Chat, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	if c := r.Chats[orderID]; c != nil {
		cp := *c
		return &cp, nil
	}
	return nil, nil
}

func (r *Repo) Messages(_ context.Context, orderID string) ([]chat.Message, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	out := []chat.Message{}
	for _, m := range r.Msgs {
		if m.OrderID == orderID {
			out = append(out, m)
		}
	}
	return out, nil
}

func (r *Repo) Add(_ context.Context, m chat.Message) (chat.Message, bool, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	if i := slices.IndexFunc(r.Msgs, func(x chat.Message) bool {
		return x.OrderID == m.OrderID && x.SenderID == m.SenderID && x.ClientID == m.ClientID
	}); i >= 0 {
		return r.Msgs[i], false, nil
	}
	r.Msgs = append(r.Msgs, m)
	return m, true, nil
}

func (r *Repo) Photo(_ context.Context, orderID, photoID string) (*chat.Photo, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	for _, m := range r.Msgs {
		if m.OrderID == orderID && m.Photo != nil && m.Photo.ID == photoID {
			return m.Photo, nil
		}
	}
	return nil, nil
}

func (r *Repo) MarkRead(_ context.Context, orderID, role string, at time.Time) (bool, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	c := r.Chats[orderID]
	if c == nil {
		return false, nil
	}
	mark := &c.CustomerReadAt
	if role == chat.Rider {
		mark = &c.RiderReadAt
	}
	if w := *r.waiting(c, role); w != nil && !w.Since.After(at) {
		*r.waiting(c, role) = nil
	}
	if *mark != nil && !at.After(**mark) {
		return false, nil
	}
	*mark = &at
	return true, nil
}

// Photos keeps photo bytes in memory.
type Photos struct {
	mu    sync.Mutex
	Files map[string][]byte
}

func NewPhotos() *Photos { return &Photos{Files: map[string][]byte{}} }

func (p *Photos) Put(_ context.Context, key, _ string, body io.Reader, _ int64) error {
	b, err := io.ReadAll(body)
	p.mu.Lock()
	defer p.mu.Unlock()
	p.Files[key] = b
	return err
}

func (p *Photos) Get(_ context.Context, key string) (io.ReadCloser, error) {
	p.mu.Lock()
	defer p.mu.Unlock()
	b, ok := p.Files[key]
	if !ok {
		return nil, fmt.Errorf("no object %s", key)
	}
	return io.NopCloser(bytes.NewReader(b)), nil
}

// Announced records what would have gone to the sockets.
type Announced struct {
	mu     sync.Mutex
	Events []chat.Event
}

func (a *Announced) Announce(_ context.Context, _ string, e chat.Event) error {
	a.mu.Lock()
	defer a.mu.Unlock()
	a.Events = append(a.Events, e)
	return nil
}

// Types are the announced event types, in order.
func (a *Announced) Types() []string {
	a.mu.Lock()
	defer a.mu.Unlock()
	var out []string
	for _, e := range a.Events {
		out = append(out, e.Type)
	}
	return out
}

// Mongo opens a fresh database on MONGO_URL, dropped after the test.
func Mongo(t *testing.T) *mongo.Database {
	t.Helper()
	url := os.Getenv("MONGO_URL")
	if url == "" {
		t.Skip("needs MONGO_URL")
	}
	client, err := mongo.Connect(options.Client().ApplyURI(url))
	if err != nil {
		t.Fatal(err)
	}
	db := client.Database("chat_test_" + NewID()[:8])
	t.Cleanup(func() {
		_ = db.Drop(context.Background())
		_ = client.Disconnect(context.Background())
	})
	return db
}

// Redis connects to REDIS_URL. Tests use fresh order ids, so nothing is flushed.
func Redis(t *testing.T) *redis.Client {
	t.Helper()
	url := os.Getenv("REDIS_URL")
	if url == "" {
		t.Skip("needs REDIS_URL")
	}
	opts, err := redis.ParseURL(url)
	if err != nil {
		t.Fatal(err)
	}
	rdb := redis.NewClient(opts)
	t.Cleanup(func() { _ = rdb.Close() })
	if err := rdb.Ping(t.Context()).Err(); err != nil {
		t.Fatal(err)
	}
	return rdb
}

// JPEG is the start of a JPEG file: enough for content sniffing.
var JPEG = append([]byte{0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 'J', 'F', 'I', 'F', 0x00}, make([]byte, 64)...)
