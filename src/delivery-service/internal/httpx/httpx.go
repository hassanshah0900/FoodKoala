// Package httpx has the JSON helpers every handler uses, with the error shape of the other services.
package httpx

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
)

// Error is a failure the client should see, with its HTTP status.
type Error struct {
	Status  int
	Message string
}

func (e *Error) Error() string { return e.Message }

func Errorf(status int, format string, args ...any) *Error {
	return &Error{Status: status, Message: fmt.Sprintf(format, args...)}
}

// WriteJSON writes v with the status.
func WriteJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

// WriteError answers with {statusCode, error, message}. Anything but an *Error is a 500 and is logged.
func WriteError(w http.ResponseWriter, r *http.Request, err error) {
	var e *Error
	if !errors.As(err, &e) {
		slog.Error("request failed", "method", r.Method, "path", r.URL.Path, "err", err)
		e = &Error{Status: http.StatusInternalServerError, Message: "Internal server error"}
	}
	WriteJSON(w, e.Status, map[string]any{"statusCode": e.Status, "error": http.StatusText(e.Status), "message": e.Message})
}

// Decode reads a JSON body into v, refusing unknown fields and bodies over 64 KiB.
func Decode(r *http.Request, v any) error {
	dec := json.NewDecoder(io.LimitReader(r.Body, 64<<10))
	dec.DisallowUnknownFields()
	if err := dec.Decode(v); err != nil {
		return Errorf(http.StatusBadRequest, "Invalid body: %v", err)
	}
	return nil
}

// Handler is an http.HandlerFunc that returns its error instead of writing it.
type Handler func(w http.ResponseWriter, r *http.Request) error

func (h Handler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if err := h(w, r); err != nil {
		WriteError(w, r, err)
	}
}

// Page is the {items, page, limit, hasMore} shape of every list.
type Page[T any] struct {
	Items   []T  `json:"items"`
	Page    int  `json:"page"`
	Limit   int  `json:"limit"`
	HasMore bool `json:"hasMore"`
}

// PageOf builds the page from up to limit+1 rows: the extra one only says there is more.
func PageOf[T any](rows []T, page, limit int) Page[T] {
	p := Page[T]{Items: rows, Page: page, Limit: limit, HasMore: len(rows) > limit}
	if p.HasMore {
		p.Items = rows[:limit]
	}
	if p.Items == nil {
		p.Items = []T{}
	}
	return p
}
