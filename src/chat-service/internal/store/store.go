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
)

// History is how many of the latest messages a chat shows; a delivery's chat is far shorter.
const History = 200

type Store struct {
	DB *mongo.Database
}

func (s Store) chats() *mongo.Collection    { return s.DB.Collection("chats") }
func (s Store) messages() *mongo.Collection { return s.DB.Collection("messages") }

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
		update = bson.M{"$set": bson.M{
			"customerId": a.CustomerID, "riderId": a.RiderID, "riderName": a.RiderName,
			"restaurantName": a.RestaurantName, "assignedAt": a.At,
		}}
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
	return res.ModifiedCount > 0, nil
}
