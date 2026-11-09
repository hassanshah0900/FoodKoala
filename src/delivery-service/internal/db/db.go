// Package db opens the Postgres pool and applies the embedded migrations.
package db

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/jackc/pgx/v5/stdlib"
	"github.com/pressly/goose/v3"

	"github.com/hassanshah0900/FoodKoala/src/delivery-service/migrations"
)

// Open connects and checks the connection.
func Open(ctx context.Context, url string) (*pgxpool.Pool, error) {
	pool, err := pgxpool.New(ctx, url)
	if err != nil {
		return nil, err
	}
	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		return nil, err
	}
	return pool, nil
}

// Migrate applies pending migrations; a release step (`server migrate`), never run on startup.
// goose keeps its version table in the `delivery` schema too.
func Migrate(ctx context.Context, url string) error {
	cfg, err := pgx.ParseConfig(url)
	if err != nil {
		return err
	}
	conn := stdlib.OpenDB(*cfg)
	defer conn.Close()
	if _, err := conn.ExecContext(ctx, "CREATE SCHEMA IF NOT EXISTS delivery"); err != nil {
		return err
	}
	goose.SetBaseFS(migrations.FS)
	goose.SetLogger(goose.NopLogger())
	goose.SetTableName("delivery.goose_db_version")
	if err := goose.SetDialect("postgres"); err != nil {
		return err
	}
	if err := goose.UpContext(ctx, conn, "."); err != nil {
		return fmt.Errorf("migrate: %w", err)
	}
	return nil
}
