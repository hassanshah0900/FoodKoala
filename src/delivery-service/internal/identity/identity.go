// Package identity reads the caller from the headers api-gateway sets (contracts/README.md#identity-headers, ADR 0005).
package identity

import (
	"context"
	"net/http"
	"regexp"
	"slices"
	"strings"

	"github.com/hassanshah0900/FoodKoala/src/delivery-service/internal/httpx"
)

type Identity struct {
	UserID string
	Phone  string
	Roles  []string
}

func (i Identity) IsAdmin() bool { return slices.Contains(i.Roles, "admin") }

var (
	uuidRe  = regexp.MustCompile(`^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$`)
	phoneRe = regexp.MustCompile(`^\+923\d{9}$`)
)

type ctxKey struct{}

// Require answers 401 unless the gateway's identity headers are present and valid.
func Require(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		id, phone := r.Header.Get("X-User-Id"), r.Header.Get("X-User-Phone")
		if !uuidRe.MatchString(id) || !phoneRe.MatchString(phone) {
			httpx.WriteError(w, r, httpx.Errorf(http.StatusUnauthorized, "Not signed in"))
			return
		}
		var roles []string
		for _, role := range strings.Split(r.Header.Get("X-User-Roles"), ",") {
			if role = strings.TrimSpace(role); role != "" {
				roles = append(roles, role)
			}
		}
		me := Identity{UserID: strings.ToLower(id), Phone: phone, Roles: roles}
		next.ServeHTTP(w, r.WithContext(context.WithValue(r.Context(), ctxKey{}, me)))
	})
}

// From returns the caller; only valid behind Require.
func From(r *http.Request) Identity {
	me, ok := r.Context().Value(ctxKey{}).(Identity)
	if !ok {
		panic("identity.From used without identity.Require")
	}
	return me
}

// RequireAdmin is Require plus the `admin` role (403 otherwise).
func RequireAdmin(next http.Handler) http.Handler {
	return Require(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !From(r).IsAdmin() {
			httpx.WriteError(w, r, httpx.Errorf(http.StatusForbidden, "Admins only"))
			return
		}
		next.ServeHTTP(w, r)
	}))
}
