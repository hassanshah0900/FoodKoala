// Package store keeps chats and their messages in MongoDB.
package store

import (
	"context"
	"errors"
	"slices"
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"

	"github.com/hassanshah0900/FoodKoala/src/chat-service/internal/chat"
	"github.com/hassanshah0900/FoodKoala/src/chat-service/internal/outbox"
)

// History is how many of the latest messages a chat shows; a delivery's chat is far shorter.
const History = 200

type Store struct {
	DB *mongo.Database
}

func (s Store) chats() *mongo.Collection    { return s.DB.Collection("chats") }
func (s Store) messages() *mongo.Collection { return s.DB.Collection("messages") }
func (s Store) outbox() *mongo.Collection   { return s.DB.Collection("outbox") }

func waitingField(role string) string { return role + "Waiting" }

// Migrate creates the indexes; it is safe to run on every start.
func (s Store) Migrate(ctx context.Context) error {
	_, err := s.messages().Indexes().CreateMany(ctx, []mongo.IndexModel{
		{Keys: bson.D{{Key: "orderId", Value: 1}, {Key: "sentAt", Value: -1}}},
		// A retried send (same clientId from the same person) finds the first message instead of adding another.
		{
			Keys:    bson.D{{Key: "orderId", Value: 1}, {Key: "senderId", Value: 1}, {Key: "clientId", Value: 1}},
			Options: options.Index().SetUnique(true),
		},
		{Keys: bson.D{{Key: "orderId", Value: 1}, {Key: "photo.id", Value: 1}}, Options: options.Index().SetSparse(true)},
	})
	if err != nil {
		return err
	}
	_, err = s.chats().Indexes().CreateMany(ctx, []mongo.IndexModel{
		{Keys: bson.D{{Key: "customerWaiting.since", Value: 1}}, Options: options.Index().SetSparse(true)},
		{Keys: bson.D{{Key: "riderWaiting.since", Value: 1}}, Options: options.Index().SetSparse(true)},
	})
	if err != nil {
		return err
	}
	_, err = s.outbox().Indexes().CreateOne(ctx, mongo.IndexModel{
		Keys: bson.D{{Key: "publishedAt", Value: 1}, {Key: "createdAt", Value: 1}},
	})
	return err
}

func (s Store) Ping(ctx context.Context) error { return s.DB.Client().Ping(ctx, nil) }

// Apply records an event's change, and says whether the chat changed. Events of an order come
// from several topics in any order and may repeat, so each update only applies when it is news:
//   - an assignment only to a chat not yet closed, and only if newer than the rider it has;
//   - a closing only once.
//
// Both are upserts. When the chat exists but the condition fails, the insert half collides on
// _id: that duplicate key error means "nothing to do". A closing that arrives first leaves a
// closed chat behind, so a late assignment can't open it.
func (s Store) Apply(ctx context.Context, c chat.Change) (bool, error) {
	var filter, update bson.M
	switch {
	case c.Assign != nil:
		a := c.Assign
		filter = bson.M{
			"_id":      c.OrderID,
			"closesAt": bson.M{"$exists": false},
			"$or":      bson.A{bson.M{"assignedAt": bson.M{"$exists": false}}, bson.M{"assignedAt": bson.M{"$lt": a.At}}},
		}
		update = bson.M{
			"$set": bson.M{
				"customerId": a.CustomerID, "customerPhone": a.CustomerPhone, "riderId": a.RiderID,
				"riderPhone": a.RiderPhone, "riderName": a.RiderName, "restaurantName": a.RestaurantName,
				"assignedAt": a.At,
			},
			// A new rider has read nothing yet, and owes nothing to the last one's unread streak.
			"$unset": bson.M{"riderWaiting": "", "riderReadAt": ""},
		}
	case c.ClosesAt != nil:
		filter = bson.M{"_id": c.OrderID, "closesAt": bson.M{"$exists": false}}
		update = bson.M{"$set": bson.M{"closesAt": *c.ClosesAt}}
	default:
		return false, nil
	}
	res, err := s.chats().UpdateOne(ctx, filter, update, options.UpdateOne().SetUpsert(true))
	if mongo.IsDuplicateKeyError(err) {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	return res.ModifiedCount > 0 || res.UpsertedCount > 0, nil
}

// Get returns the order's chat, or nil when there is none.
func (s Store) Get(ctx context.Context, orderID string) (*chat.Chat, error) {
	var c chat.Chat
	err := s.chats().FindOne(ctx, bson.M{"_id": orderID}).Decode(&c)
	if errors.Is(err, mongo.ErrNoDocuments) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &c, nil
}

// Messages are the chat's latest History messages, oldest first.
func (s Store) Messages(ctx context.Context, orderID string) ([]chat.Message, error) {
	cur, err := s.messages().Find(ctx, bson.M{"orderId": orderID},
		options.Find().SetSort(bson.D{{Key: "sentAt", Value: -1}, {Key: "_id", Value: -1}}).SetLimit(History))
	if err != nil {
		return nil, err
	}
	msgs := []chat.Message{}
	if err := cur.All(ctx, &msgs); err != nil {
		return nil, err
	}
	slices.Reverse(msgs)
	return msgs, nil
}

// Add saves a message. A retry (the same sender and clientId) returns the first one, with created false.
func (s Store) Add(ctx context.Context, m chat.Message) (chat.Message, bool, error) {
	_, err := s.messages().InsertOne(ctx, m)
	if err == nil {
		return m, true, nil
	}
	if !mongo.IsDuplicateKeyError(err) {
		return chat.Message{}, false, err
	}
	var first chat.Message
	err = s.messages().FindOne(ctx, bson.M{"orderId": m.OrderID, "senderId": m.SenderID, "clientId": m.ClientID}).Decode(&first)
	return first, false, err
}

// Photo finds the message carrying a photo of the chat; nil when there is none.
func (s Store) Photo(ctx context.Context, orderID, photoID string) (*chat.Photo, error) {
	var m chat.Message
	err := s.messages().FindOne(ctx, bson.M{"orderId": orderID, "photo.id": photoID}).Decode(&m)
	if errors.Is(err, mongo.ErrNoDocuments) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return m.Photo, nil
}

// Waiting starts an unread streak for `role` at `at`, unless one is already running.
func (s Store) Waiting(ctx context.Context, orderID, role string, at time.Time) error {
	field := waitingField(role)
	_, err := s.chats().UpdateOne(ctx,
		bson.M{"_id": orderID, field: bson.M{"$exists": false}},
		bson.M{"$set": bson.M{field: chat.Waiting{Since: at}}})
	return err
}

// Due lists chats where someone has waited since before `cutoff` and wasn't told yet.
func (s Store) Due(ctx context.Context, cutoff time.Time) ([]chat.Chat, error) {
	or := bson.A{}
	for _, role := range []string{chat.Customer, chat.Rider} {
		f := waitingField(role)
		or = append(or, bson.M{f + ".nudged": false, f + ".since": bson.M{"$lte": cutoff}})
	}
	cur, err := s.chats().Find(ctx, bson.M{"$or": or}, options.Find().SetLimit(100))
	if err != nil {
		return nil, err
	}
	var due []chat.Chat
	return due, cur.All(ctx, &due)
}

// Nudged records that `role` was told about the streak that began at `since`. With an event, it is
// written to the outbox first under an id made from the streak, so a nudge retried after a crash
// writes nothing new; then the streak is marked, only if it is still the same one.
func (s Store) Nudged(ctx context.Context, orderID, role string, since time.Time, event *outbox.Event) error {
	if event != nil {
		if _, err := s.outbox().InsertOne(ctx, event); err != nil && !mongo.IsDuplicateKeyError(err) {
			return err
		}
	}
	f := waitingField(role)
	_, err := s.chats().UpdateOne(ctx, bson.M{"_id": orderID, f + ".since": since}, bson.M{"$set": bson.M{f + ".nudged": true}})
	return err
}

// Unpublished are up to `limit` events not yet published, oldest first.
func (s Store) Unpublished(ctx context.Context, limit int) ([]outbox.Event, error) {
	cur, err := s.outbox().Find(ctx, bson.M{"publishedAt": bson.M{"$exists": false}},
		options.Find().SetSort(bson.D{{Key: "createdAt", Value: 1}}).SetLimit(int64(limit)))
	if err != nil {
		return nil, err
	}
	var events []outbox.Event
	return events, cur.All(ctx, &events)
}

// MarkPublished records that the broker has these events.
func (s Store) MarkPublished(ctx context.Context, ids []string, at time.Time) error {
	_, err := s.outbox().UpdateMany(ctx, bson.M{"_id": bson.M{"$in": ids}}, bson.M{"$set": bson.M{"publishedAt": at}})
	return err
}

// MarkRead moves a side's read mark forward to `at` (never back); true when it moved.
func (s Store) MarkRead(ctx context.Context, orderID, role string, at time.Time) (bool, error) {
	field := map[string]string{chat.Customer: "customerReadAt", chat.Rider: "riderReadAt"}[role]
	if field == "" {
		return false, errors.New("no read mark for role " + role)
	}
	res, err := s.chats().UpdateOne(ctx, bson.M{"_id": orderID}, bson.M{"$max": bson.M{field: at}})
	if err != nil {
		return false, err
	}
	// Reading ends the unread streak that began before now, whether or not they were told about it.
	waiting := waitingField(role)
	if _, err := s.chats().UpdateOne(ctx, bson.M{"_id": orderID, waiting + ".since": bson.M{"$lte": at}},
		bson.M{"$unset": bson.M{waiting: ""}}); err != nil {
		return false, err
	}
	return res.ModifiedCount > 0, nil
}
