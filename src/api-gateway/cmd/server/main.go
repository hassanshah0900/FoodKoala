package main

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/hassanshah0900/FoodKoala/src/api-gateway/internal/server"
)

func main() {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, nil)).With("service", "api-gateway")
	slog.SetDefault(logger)

	cfg := server.LoadConfig()
	srv := &http.Server{
		Addr:              ":" + cfg.Port,
		Handler:           server.New(cfg),
		ReadHeaderTimeout: 5 * time.Second,
	}

	go func() {
		slog.Info("listening", "port", cfg.Port)
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			slog.Error("server failed", "err", err)
			os.Exit(1)
		}
	}()

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	<-ctx.Done()

	slog.Info("shutting down")
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	_ = srv.Shutdown(shutdownCtx)
}
