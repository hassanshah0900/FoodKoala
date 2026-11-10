// Package testdb gives integration tests a migrated Postgres, or skips them without DATABASE_URL.
package testdb

import (
	"context"
	"os"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/hassanshah0900/FoodKoala/src/delivery-service/internal/db"
)

// Open migrates the database at DATABASE_URL and empties the delivery tables.
func Open(t *testing.T) *pgxpool.Pool {
	t.Helper()
	url := os.Getenv("DATABASE_URL")
	if url == "" {
		t.Skip("needs DATABASE_URL (a PostgreSQL to migrate)")
	}
	ctx := context.Background()
	if err := db.Migrate(ctx, url); err != nil {
		t.Fatal(err)
	}
	pool, err := db.Open(ctx, url)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(pool.Close)
	if _, err := pool.Exec(ctx, `TRUNCATE delivery.settlements, delivery.deliveries, delivery.riders, delivery.processed_events, delivery.outbox`); err != nil {
		t.Fatal(err)
	}
	return pool
}
