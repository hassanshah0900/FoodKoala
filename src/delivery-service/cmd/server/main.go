// delivery-service: riders, their shifts, and getting each order from the restaurant to the door.
//
//	server           run the API, the order-event consumer, the rider assigner and the outbox relay
//	server migrate       apply database migrations (a release step) and exit
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

	"github.com/twmb/franz-go/pkg/kgo"

	"github.com/hassanshah0900/FoodKoala/src/delivery-service/internal/api"
	"github.com/hassanshah0900/FoodKoala/src/delivery-service/internal/config"
	"github.com/hassanshah0900/FoodKoala/src/delivery-service/internal/consumer"
	"github.com/hassanshah0900/FoodKoala/src/delivery-service/internal/db"
	"github.com/hassanshah0900/FoodKoala/src/delivery-service/internal/deliveries"
	"github.com/hassanshah0900/FoodKoala/src/delivery-service/internal/inbox"
	"github.com/hassanshah0900/FoodKoala/src/delivery-service/internal/outbox"
	"github.com/hassanshah0900/FoodKoala/src/delivery-service/internal/riders"
)

func main() {
	slog.SetDefault(slog.New(slog.NewJSONHandler(os.Stdout, nil)).With("service", "delivery-service"))
	if len(os.Args) > 1 && os.Args[1] == "healthcheck" {
		os.Exit(healthcheck())
	}
	if err := run(); err != nil {
		slog.Error("delivery-service failed", "err", err)
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

	if len(os.Args) > 1 && os.Args[1] == "migrate" {
		if err := db.Migrate(ctx, cfg.DatabaseURL); err != nil {
			return err
		}
		slog.Info("migrations applied")
		return nil
	}

	pool, err := db.Open(ctx, cfg.DatabaseURL)
	if err != nil {
		return err
	}
	defer pool.Close()

	dels := deliveries.Service{DB: pool, MaxPickupMeters: cfg.MaxPickupMeters, LocationFreshFor: cfg.LocationFreshFor}
	deps := api.Deps{DB: pool, Deliveries: dels}
	rs := riders.Service{DB: pool}
	var workers sync.WaitGroup
	start := func(f func()) { workers.Add(1); go func() { defer workers.Done(); f() }() }

	start(func() { dels.RunAssigner(ctx, cfg.AssignEvery) })
	if len(cfg.KafkaBrokers) > 0 {
		in := inbox.Inbox{DB: pool, Handlers: inbox.Merge(dels.Handlers(), rs.Handlers())}
		c, err := consumer.New(cfg.KafkaBrokers, cfg.KafkaGroupID, in.Topics(), in.Apply)
		if err != nil {
			return err
		}
		defer c.Client.Close()
		deps.ConsumerAlive = c.Alive
		start(func() { c.Run(ctx) })

		producer, err := kgo.NewClient(kgo.SeedBrokers(cfg.KafkaBrokers...), kgo.AllowAutoTopicCreation())
		if err != nil {
			return err
		}
		defer producer.Close()
		rs.Locations = outbox.Direct{Client: producer}
		relay := outbox.Relay{DB: pool, Publisher: outbox.KafkaPublisher{Client: producer}, Batch: 100, Every: cfg.OutboxPollEvery}
		start(func() { relay.Run(ctx) })
	} else {
		slog.Warn("KAFKA_BROKERS is not set: order events are not consumed and delivery events stay in the outbox")
	}

	deps.Riders = rs
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
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	_ = srv.Shutdown(shutdownCtx)
	workers.Wait()
	return nil
}

func healthcheck() int {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8081"
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
