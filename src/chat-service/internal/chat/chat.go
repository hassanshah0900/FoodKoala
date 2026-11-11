// Package chat holds the rules of a chat between a customer and the rider bringing their order.
// It is pure: the store keeps chats and messages, this package decides who may do what.
package chat

import (
	"encoding/json"
	"errors"
	"fmt"
	"slices"
	"strings"
	"time"
	"unicode/utf8"
)

// ErrMalformed means an event can never be applied; it is skipped so it doesn't block its partition.
var ErrMalformed = errors.New("malformed event")

// Roles in a chat.
const (
	Customer = "customer"
	Rider    = "rider"
)

// Grace is how long a chat stays open after the order is delivered or called off,
// for "I left it at the gate" and "Thanks!".
const Grace = time.Hour

// Refusal is a reason to show the person who tried something the chat doesn't allow.
type Refusal string

func (r Refusal) Error() string { return string(r) }

// MaxText is the longest text message, in characters.
const MaxText = 1000

// Chat is one order's conversation. It opens when a rider is assigned; a newer
// assignment replaces the rider. ClosesAt is set once the order is finished.
type Chat struct {
	OrderID        string     `json:"orderId" bson:"_id"`
	CustomerID     string     `json:"-" bson:"customerId,omitempty"`
	RiderID        string     `json:"-" bson:"riderId,omitempty"`
	RiderName      string     `json:"riderName" bson:"riderName,omitempty"`
	RestaurantName string     `json:"restaurantName" bson:"restaurantName,omitempty"`
	AssignedAt     time.Time  `json:"-" bson:"assignedAt,omitempty"`
	ClosesAt       *time.Time `json:"closesAt" bson:"closesAt,omitempty"`
	// When each side last read the chat: the other side's read receipts.
	CustomerReadAt *time.Time `json:"customerReadAt" bson:"customerReadAt,omitempty"`
	RiderReadAt    *time.Time `json:"riderReadAt" bson:"riderReadAt,omitempty"`
	// For texting each side when a message waits too long (Nudge). Never shown.
	CustomerPhone string `json:"-" bson:"customerPhone,omitempty"`
	RiderPhone    string `json:"-" bson:"riderPhone,omitempty"`
	// Since when each side has an unread message, and whether they were told about it.
	CustomerWaiting *Waiting `json:"-" bson:"customerWaiting,omitempty"`
	RiderWaiting    *Waiting `json:"-" bson:"riderWaiting,omitempty"`
}

// Waiting is an unread streak: messages to one side since they last read the chat.
type Waiting struct {
	Since  time.Time `bson:"since"`
	Nudged bool      `bson:"nudged"`
}

// NudgeAfter is how long a message waits unread before its reader is told by SMS and in their inbox.
// Someone with the chat open reads it at once, so they are never told.
const NudgeAfter = time.Minute

// Other is the other side of the chat.
func Other(role string) string {
	if role == Customer {
		return Rider
	}
	return Customer
}

// Due lists the sides waiting at least NudgeAfter at `now` and not yet told, while the chat is open.
func (c *Chat) Due(now time.Time) []string {
	if !c.Open(now) {
		return nil
	}
	var due []string
	for role, w := range map[string]*Waiting{Customer: c.CustomerWaiting, Rider: c.RiderWaiting} {
		if w != nil && !w.Nudged && !now.Before(w.Since.Add(NudgeAfter)) {
			due = append(due, role)
		}
	}
	slices.Sort(due)
	return due
}

// Nudge is the data of a chat.message_waiting event (contracts/events/chat.message_waiting.schema.json).
type Nudge struct {
	OrderID        string `json:"orderId"`
	RecipientID    string `json:"recipientId"`
	RecipientRole  string `json:"recipientRole"`
	RecipientPhone string `json:"recipientPhone"`
	SenderRole     string `json:"senderRole"`
	// The rider's name when the rider wrote; null when the customer did (riders don't learn customers' names).
	SenderName     *string `json:"senderName"`
	RestaurantName string  `json:"restaurantName"`
	Unread         int     `json:"unread"`
	// The latest unread message, cut to NudgePreview characters; "" for a photo without a caption.
	Preview string    `json:"preview"`
	Photo   bool      `json:"photo"`
	Since   time.Time `json:"since"`
}

// NudgePreview is how much of the message an SMS repeats.
const NudgePreview = 80

// NudgeFor is the event telling `role` about the messages waiting for them; nil when there are none.
func (c *Chat) NudgeFor(role string, msgs []Message) *Nudge {
	w, id, phone := c.CustomerWaiting, c.CustomerID, c.CustomerPhone
	if role == Rider {
		w, id, phone = c.RiderWaiting, c.RiderID, c.RiderPhone
	}
	if w == nil || id == "" || phone == "" {
		return nil
	}
	var waiting []Message
	for _, m := range msgs {
		if m.From != role && !m.SentAt.Before(w.Since) {
			waiting = append(waiting, m)
		}
	}
	if len(waiting) == 0 {
		return nil
	}
	last := waiting[len(waiting)-1]
	n := &Nudge{
		OrderID: c.OrderID, RecipientID: id, RecipientRole: role, RecipientPhone: phone,
		SenderRole: Other(role), RestaurantName: c.RestaurantName, Unread: len(waiting),
		Preview: preview(last.Text), Photo: last.Photo != nil, Since: w.Since,
	}
	if n.SenderRole == Rider {
		name := c.RiderName
		n.SenderName = &name
	}
	return n
}

func preview(text string) string {
	if utf8.RuneCountInString(text) <= NudgePreview {
		return text
	}
	r := []rune(text)
	return strings.TrimSpace(string(r[:NudgePreview-1])) + "…"
}

// RoleOf is the caller's part in the chat, or "" when they have none.
func (c *Chat) RoleOf(userID string) string {
	switch {
	case c.CustomerID != "" && c.CustomerID == userID:
		return Customer
	case c.RiderID != "" && c.RiderID == userID:
		return Rider
	}
	return ""
}

// CanRead: the customer, the current rider, and admins (who only read, to help when something went wrong).
func (c *Chat) CanRead(userID string, admin bool) bool {
	return admin || c.RoleOf(userID) != ""
}

// Started is true once a rider has been assigned; before that there is nobody to talk to.
func (c *Chat) Started() bool { return c.RiderID != "" }

// Open says whether messages can still be sent at `now`.
func (c *Chat) Open(now time.Time) bool {
	return c.Started() && (c.ClosesAt == nil || now.Before(*c.ClosesAt))
}

// Message is one line of the chat: text, or a photo with an optional caption.
type Message struct {
	ID       string    `json:"id" bson:"_id"`
	OrderID  string    `json:"-" bson:"orderId"`
	SenderID string    `json:"-" bson:"senderId"`
	From     string    `json:"from" bson:"from"`
	ClientID string    `json:"clientId" bson:"clientId"`
	Text     string    `json:"text" bson:"text"`
	Photo    *Photo    `json:"photo" bson:"photo,omitempty"`
	SentAt   time.Time `json:"sentAt" bson:"sentAt"`
}

// Photo is a picture in the chat; Key is where the bytes are kept, never shown to clients.
type Photo struct {
	ID          string `json:"id" bson:"id"`
	Key         string `json:"-" bson:"key"`
	ContentType string `json:"contentType" bson:"contentType"`
	Size        int64  `json:"size" bson:"size"`
}

// CleanText trims a message and checks its length; a photo may come without text.
func CleanText(text string, photo bool) (string, error) {
	text = strings.TrimSpace(text)
	switch n := utf8.RuneCountInString(text); {
	case n == 0 && !photo:
		return "", Refusal("Write a message")
	case n > MaxText:
		return "", Refusal(fmt.Sprintf("Keep messages under %d characters", MaxText))
	}
	return text, nil
}

// MaxPhotoBytes is the largest photo accepted: a phone picture, resized by the app if needed.
const MaxPhotoBytes = 5 << 20

// PhotoTypes are the image types accepted, by their sniffed content type.
var PhotoTypes = []string{"image/jpeg", "image/png", "image/webp"}

// PhotoType checks what the first bytes of an upload say it is, and returns its content type.
func PhotoType(sniffed string) (string, error) {
	if !slices.Contains(PhotoTypes, sniffed) {
		return "", Refusal("Send a JPEG, PNG or WebP photo")
	}
	return sniffed, nil
}

// Envelope is contracts/README.md#event-envelope.
type Envelope struct {
	ID   string          `json:"id"`
	Type string          `json:"type"`
	Data json.RawMessage `json:"data"`
}

// Topics are the events Change understands; the consumer subscribes to them.
var Topics = []string{"delivery.assigned", "delivery.delivered", "order.status_changed"}

// Change is what an event does to a chat: Assign a rider, or Close it.
type Change struct {
	OrderID string
	Assign  *Assignment
	// Set when the order is finished: the chat closes Grace after it.
	ClosesAt *time.Time
}

// Assignment opens the chat (or hands it to another rider).
type Assignment struct {
	CustomerID     string
	CustomerPhone  string
	RiderID        string
	RiderPhone     string
	RiderName      string
	RestaurantName string
	At             time.Time
}

// ChangeOf reads an event. A nil Change means the event is about something chat doesn't follow
// (e.g. an order accepted); ErrMalformed means it is broken.
func ChangeOf(env Envelope) (*Change, error) {
	var e struct {
		OrderID        string    `json:"orderId"`
		CustomerID     string    `json:"customerId"`
		CustomerPhone  string    `json:"customerPhone"`
		RiderID        string    `json:"riderId"`
		RiderPhone     string    `json:"riderPhone"`
		RiderName      string    `json:"riderName"`
		RestaurantName string    `json:"restaurantName"`
		To             string    `json:"to"`
		At             time.Time `json:"at"`
	}
	if err := json.Unmarshal(env.Data, &e); err != nil {
		return nil, fmt.Errorf("%w: %v", ErrMalformed, err)
	}
	if e.OrderID == "" || e.At.IsZero() {
		return nil, fmt.Errorf("%w: %s without orderId or at", ErrMalformed, env.Type)
	}
	// MongoDB keeps milliseconds; compare like with like, so a repeated event is never "newer".
	e.At = e.At.Truncate(time.Millisecond)
	closing := func() *Change {
		at := e.At.Add(Grace)
		return &Change{OrderID: e.OrderID, ClosesAt: &at}
	}
	switch env.Type {
	case "delivery.assigned":
		if e.CustomerID == "" || e.RiderID == "" {
			return nil, fmt.Errorf("%w: delivery.assigned without customerId or riderId", ErrMalformed)
		}
		return &Change{OrderID: e.OrderID, Assign: &Assignment{
			CustomerID: e.CustomerID, CustomerPhone: e.CustomerPhone, RiderID: e.RiderID, RiderPhone: e.RiderPhone,
			RiderName:      e.RiderName,
			RestaurantName: e.RestaurantName, At: e.At,
		}}, nil
	case "delivery.delivered":
		return closing(), nil
	case "order.status_changed":
		if e.To == "delivered" || e.To == "rejected" || e.To == "cancelled" {
			return closing(), nil
		}
		return nil, nil
	}
	return nil, fmt.Errorf("%w: type %q", ErrMalformed, env.Type)
}

// Event is one thing sent on a chat's live socket.
type Event struct {
	// "snapshot" (the chat and its messages, sent first and to catch up), "message" or "read".
	Type    string     `json:"type"`
	Chat    *View      `json:"chat,omitempty"`
	Message *Message   `json:"message,omitempty"`
	Role    string     `json:"role,omitempty"`
	ReadAt  *time.Time `json:"readAt,omitempty"`
}

// View is Chat in contracts/openapi/chat-service.yaml: the chat as one caller sees it.
type View struct {
	Chat
	// The caller's role; "" for an admin reading along.
	Me       string    `json:"me"`
	Open     bool      `json:"open"`
	Messages []Message `json:"messages"`
}

// ViewFor is the chat with its messages as `userID` sees it at `now`.
func ViewFor(c *Chat, msgs []Message, userID string, now time.Time) View {
	if msgs == nil {
		msgs = []Message{}
	}
	return View{Chat: *c, Me: c.RoleOf(userID), Open: c.Open(now), Messages: msgs}
}
