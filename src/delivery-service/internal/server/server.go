// Package server wires the HTTP routes of delivery-service.
package server

import (
	"encoding/json"
	"net/http"
	"os"
)

type Config struct {
	Port string
}

func LoadConfig() Config {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8081"
	}
	return Config{Port: port}
}

// New returns the service's HTTP handler.
func New(_ Config) http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", ok)
	mux.HandleFunc("GET /readyz", ok)
	// TODO(delivery-service): rider shifts, availability, order assignment and COD cash ledger.
	return mux
}

func ok(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
}
