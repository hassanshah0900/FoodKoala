package photos_test

import (
	"bytes"
	"context"
	"io"
	"os"
	"testing"

	"github.com/hassanshah0900/FoodKoala/src/chat-service/internal/photos"
	"github.com/hassanshah0900/FoodKoala/src/chat-service/internal/testenv"
)

// Against MinIO: S3_ENDPOINT=localhost:9000 S3_ACCESS_KEY=... S3_SECRET_KEY=... go test ./...
func TestStoresAndReadsBack(t *testing.T) {
	endpoint := os.Getenv("S3_ENDPOINT")
	if endpoint == "" {
		t.Skip("needs S3_ENDPOINT")
	}
	s, err := photos.New(endpoint, os.Getenv("S3_ACCESS_KEY"), os.Getenv("S3_SECRET_KEY"), "chat-test-"+testenv.NewID()[:8], false)
	if err != nil {
		t.Fatal(err)
	}
	ctx := context.Background()
	if err := s.EnsureBucket(ctx); err != nil {
		t.Fatal(err)
	}
	if err := s.EnsureBucket(ctx); err != nil {
		t.Fatal("twice is fine")
	}
	key := "chats/o1/" + testenv.NewID()
	if err := s.Put(ctx, key, "image/jpeg", bytes.NewReader(testenv.JPEG), int64(len(testenv.JPEG))); err != nil {
		t.Fatal(err)
	}
	r, err := s.Get(ctx, key)
	if err != nil {
		t.Fatal(err)
	}
	defer r.Close()
	b, err := io.ReadAll(r)
	if err != nil || !bytes.Equal(b, testenv.JPEG) {
		t.Fatalf("read back %d bytes, %v", len(b), err)
	}
	if err := s.Ping(ctx); err != nil {
		t.Fatal(err)
	}
}
