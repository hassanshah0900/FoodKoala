// tracking-service: where the rider is, live, and when the food should arrive.
//
//	server               run the API, the WebSockets and the event consumer
//	server healthcheck   exit 0 if this container's /readyz answers 200 (the image has no curl)
package main

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"sync"
	"syscall"
	"time"

	"github.com/redis/go-redis/v9"

	"github.com/hassanshah0900/FoodKoala/src/tracking-service/internal/api"
	"github.com/hassanshah0900/FoodKoala/src/tracking-service/internal/config"
	"github.com/hassanshah0900/FoodKoala/src/tracking-service/internal/consumer"
	"github.com/hassanshah0900/FoodKoala/src/tracking-service/internal/store"
	"github.com/hassanshah0900/FoodKoala/src/tracking-service/internal/tracking"
)

func main() {
	slog.SetDefault(slog.New(slog.NewJSONHandler(os.Stdout, nil)).With("service", "tracking-service"))
	if len(os.Args) > 1 && os.Args[1] == "healthcheck" {
		os.Exit(healthcheck())
	}
	if err := run(); err != nil {
		slog.Error("tracking-service failed", "err", err)
		os.Exit(1)
	}
}

func run() error {
	cfg, err := config.Load(os.Getenv)
	if err != nil {
		return err
	}
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	opts, err := redis.ParseURL(cfg.RedisURL)
	if err != nil {
		return err
	}
	rdb := redis.NewClient(opts)
	defer rdb.Close()

	st := store.Store{Redis: rdb}
	hub := store.NewHub(ctx, rdb)
	defer hub.Close()
	deps := api.Deps{Store: st, Hub: hub}

	var workers sync.WaitGroup
	start := func(f func()) { workers.Add(1); go func() { defer workers.Done(); f() }() }
	start(func() { hub.Run(ctx) })
	if len(cfg.KafkaBrokers) > 0 {
		c, err := consumer.New(cfg.KafkaBrokers, cfg.KafkaGroupID, tracking.Topics, consumer.Decode(st.Apply))
		if err != nil {
			return err
		}
		defer c.Client.Close()
		deps.ConsumerAlive = c.Alive
		start(func() { c.Run(ctx) })
	} else {
		slog.Warn("KAFKA_BROKERS is not set: no events are consumed, so tracking never changes")
	}

	srv := &http.Server{Addr: ":" + cfg.Port, Handler: api.New(deps), ReadHeaderTimeout: 5 * time.Second}
	errs := make(chan error, 1)
	go func() {
		slog.Info("listening", "port", cfg.Port)
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			errs <- err
		}
	}()
	select {
	case err := <-errs:
		stop()
		workers.Wait()
		return err
	case <-ctx.Done():
	}
	slog.Info("shutting down")
	// Shutdown doesn't wait for hijacked connections; the sockets end with ctx.
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	_ = srv.Shutdown(shutdownCtx)
	workers.Wait()
	return nil
}

func healthcheck() int {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8082"
	}
	client := http.Client{Timeout: 2 * time.Second}
	res, err := client.Get("http://127.0.0.1:" + port + "/readyz")
	if err != nil {
		return 1
	}
	_ = res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return 1
	}
	return 0
}
