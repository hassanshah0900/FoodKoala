// Package service is what chat-service does: open and close chats from events, and let the
// customer and rider of an order talk, with live delivery and read receipts.
package service

import (
	"bytes"
	"context"
	"crypto/rand"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"time"

	"github.com/hassanshah0900/FoodKoala/src/chat-service/internal/chat"
	"github.com/hassanshah0900/FoodKoala/src/chat-service/internal/httpx"
	"github.com/hassanshah0900/FoodKoala/src/chat-service/internal/identity"
)

// Repo keeps chats and messages (store.Store).
type Repo interface {
	Apply(ctx context.Context, c chat.Change) (bool, error)
	Get(ctx context.Context, orderID string) (*chat.Chat, error)
	Messages(ctx context.Context, orderID string) ([]chat.Message, error)
	Add(ctx context.Context, m chat.Message) (chat.Message, bool, error)
	Photo(ctx context.Context, orderID, photoID string) (*chat.Photo, error)
	MarkRead(ctx context.Context, orderID, role string, at time.Time) (bool, error)
}

// Photos keeps photo bytes (photos.S3).
type Photos interface {
	Put(ctx context.Context, key, contentType string, body io.Reader, size int64) error
	Get(ctx context.Context, key string) (io.ReadCloser, error)
}

// Announcer tells every replica's sockets about a chat event (live.Publisher).
type Announcer interface {
	Announce(ctx context.Context, orderID string, e chat.Event) error
}

type Service struct {
	Repo Repo
	// Nil when photos are turned off (no S3_ENDPOINT).
	Photos Photos
	Live   Announcer
	Now    func() time.Time
}

func (s Service) now() time.Time {
	if s.Now != nil {
		return s.Now().UTC().Truncate(time.Millisecond)
	}
	return time.Now().UTC().Truncate(time.Millisecond)
}

// announce tells the sockets; a failure is only logged, since the message is saved and sockets catch up.
func (s Service) announce(ctx context.Context, orderID string, e chat.Event) {
	if err := s.Live.Announce(ctx, orderID, e); err != nil {
		slog.Warn("announcing a chat event failed", "order", orderID, "type", e.Type, "err", err)
	}
}

// Apply follows an event: a rider assigned opens (or hands over) the chat, a finished order closes it.
func (s Service) Apply(ctx context.Context, env chat.Envelope) error {
	change, err := chat.ChangeOf(env)
	if err != nil || change == nil {
		return err
	}
	changed, err := s.Repo.Apply(ctx, *change)
	if err != nil {
		return err
	}
	if changed {
		// Sockets reload the chat: a new rider, or closing, changes who may write.
		s.announce(ctx, change.OrderID, chat.Event{Type: "changed"})
	}
	return nil
}

var ErrNotFound = httpx.Errorf(http.StatusNotFound, "No chat for this order")

// Visible is the order's chat if the caller may read it; 404 otherwise, as if it didn't exist.
func (s Service) Visible(ctx context.Context, me identity.Identity, orderID string) (*chat.Chat, error) {
	c, err := s.Repo.Get(ctx, orderID)
	if err != nil {
		return nil, err
	}
	if c == nil || !c.Started() || !c.CanRead(me.UserID, me.IsAdmin()) {
		return nil, ErrNotFound
	}
	return c, nil
}

// View is the chat and its latest messages as the caller sees them.
func (s Service) View(ctx context.Context, me identity.Identity, orderID string) (chat.View, error) {
	c, err := s.Visible(ctx, me, orderID)
	if err != nil {
		return chat.View{}, err
	}
	msgs, err := s.Repo.Messages(ctx, orderID)
	if err != nil {
		return chat.View{}, err
	}
	return chat.ViewFor(c, msgs, me.UserID, s.now()), nil
}

// writable is the chat and the caller's role in it, if they may write now.
func (s Service) writable(ctx context.Context, me identity.Identity, orderID string) (*chat.Chat, string, error) {
	c, err := s.Visible(ctx, me, orderID)
	if err != nil {
		return nil, "", err
	}
	role := c.RoleOf(me.UserID)
	if role == "" {
		return nil, "", httpx.Errorf(http.StatusForbidden, "Admins can read chats but not write in them")
	}
	if !c.Open(s.now()) {
		return nil, "", httpx.Errorf(http.StatusConflict, "This chat has closed")
	}
	return c, role, nil
}

func refused(err error) error {
	if r, ok := err.(chat.Refusal); ok {
		return httpx.Errorf(http.StatusBadRequest, "%s", string(r))
	}
	return err
}

// Send adds a text message. `created` is false for a retry of one already sent (same clientId).
func (s Service) Send(ctx context.Context, me identity.Identity, orderID, clientID, text string) (chat.Message, bool, error) {
	text, err := chat.CleanText(text, false)
	if err != nil {
		return chat.Message{}, false, refused(err)
	}
	return s.add(ctx, me, orderID, clientID, text, nil)
}

// SendPhoto stores a photo and adds it to the chat with an optional caption.
func (s Service) SendPhoto(ctx context.Context, me identity.Identity, orderID, clientID, caption string, data []byte) (chat.Message, bool, error) {
	if s.Photos == nil {
		return chat.Message{}, false, httpx.Errorf(http.StatusServiceUnavailable, "Photos are not available right now")
	}
	caption, err := chat.CleanText(caption, true)
	if err != nil {
		return chat.Message{}, false, refused(err)
	}
	if len(data) > chat.MaxPhotoBytes {
		return chat.Message{}, false, httpx.Errorf(http.StatusRequestEntityTooLarge, "Photos can be up to %d MB", chat.MaxPhotoBytes>>20)
	}
	contentType, err := chat.PhotoType(http.DetectContentType(data))
	if err != nil {
		return chat.Message{}, false, refused(err)
	}
	if _, _, err := s.writable(ctx, me, orderID); err != nil {
		return chat.Message{}, false, err
	}
	id := newID()
	photo := &chat.Photo{ID: id, Key: fmt.Sprintf("chats/%s/%s", orderID, id), ContentType: contentType, Size: int64(len(data))}
	if err := s.Photos.Put(ctx, photo.Key, contentType, bytes.NewReader(data), photo.Size); err != nil {
		return chat.Message{}, false, err
	}
	return s.add(ctx, me, orderID, clientID, caption, photo)
}

func (s Service) add(ctx context.Context, me identity.Identity, orderID, clientID, text string, photo *chat.Photo) (chat.Message, bool, error) {
	_, role, err := s.writable(ctx, me, orderID)
	if err != nil {
		return chat.Message{}, false, err
	}
	m := chat.Message{
		ID: newID(), OrderID: orderID, SenderID: me.UserID, From: role,
		ClientID: clientID, Text: text, Photo: photo, SentAt: s.now(),
	}
	saved, created, err := s.Repo.Add(ctx, m)
	if err != nil {
		return chat.Message{}, false, err
	}
	if created {
		s.announce(ctx, orderID, chat.Event{Type: "message", Message: &saved})
		// Sending is reading: everything before your own message has been seen.
		s.markRead(ctx, orderID, role, saved.SentAt)
	}
	return saved, created, nil
}

// Read marks the chat read by the caller up to now, so the other side sees it was read.
func (s Service) Read(ctx context.Context, me identity.Identity, orderID string) error {
	c, err := s.Visible(ctx, me, orderID)
	if err != nil {
		return err
	}
	if role := c.RoleOf(me.UserID); role != "" { // an admin reading along leaves no mark
		s.markRead(ctx, orderID, role, s.now())
	}
	return nil
}

func (s Service) markRead(ctx context.Context, orderID, role string, at time.Time) {
	moved, err := s.Repo.MarkRead(ctx, orderID, role, at)
	if err != nil {
		slog.Warn("marking a chat read failed", "order", orderID, "err", err)
		return
	}
	if moved {
		s.announce(ctx, orderID, chat.Event{Type: "read", Role: role, ReadAt: &at})
	}
}

// Photo opens one of the chat's photos for someone who may read the chat.
func (s Service) Photo(ctx context.Context, me identity.Identity, orderID, photoID string) (io.ReadCloser, *chat.Photo, error) {
	if s.Photos == nil {
		return nil, nil, httpx.Errorf(http.StatusServiceUnavailable, "Photos are not available right now")
	}
	if _, err := s.Visible(ctx, me, orderID); err != nil {
		return nil, nil, err
	}
	p, err := s.Repo.Photo(ctx, orderID, photoID)
	if err != nil {
		return nil, nil, err
	}
	if p == nil {
		return nil, nil, httpx.Errorf(http.StatusNotFound, "No such photo")
	}
	body, err := s.Photos.Get(ctx, p.Key)
	return body, p, err
}

// newID is a random (version 4) UUID.
func newID() string {
	var b [16]byte
	_, _ = rand.Read(b[:])
	b[6] = b[6]&0x0f | 0x40
	b[8] = b[8]&0x3f | 0x80
	return fmt.Sprintf("%x-%x-%x-%x-%x", b[0:4], b[4:6], b[6:8], b[8:10], b[10:16])
}
