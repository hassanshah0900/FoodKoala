package auth

import (
	"context"
	"log/slog"
	"net/http"
	"strings"
)

// Identity headers forwarded to services (contracts/README.md, ADR 0005).
const (
	HeaderUserID    = "X-User-Id"
	HeaderUserRoles = "X-User-Roles"
	HeaderUserPhone = "X-User-Phone"
)

// TokenVerifier is implemented by *Verifier.
type TokenVerifier interface {
	Verify(ctx context.Context, token string) (*Claims, error)
}

// Policy says which /api/v1/<service> routes work without a token.
type Policy struct {
	// Public services accept anonymous requests; a token, if sent, must still be valid.
	Public map[string]bool
	// IgnoreToken services never look at the Authorization header (auth-service itself).
	IgnoreToken map[string]bool
}

// DefaultPolicy is the route policy from ADR 0005.
var DefaultPolicy = Policy{
	Public:      map[string]bool{"auth": true, "restaurants": true, "menus": true, "search": true},
	IgnoreToken: map[string]bool{"auth": true},
}

// Middleware authenticates /api/v1/ requests and forwards the caller's identity as headers.
// Other paths (health checks) pass through untouched.
func Middleware(v TokenVerifier, p Policy, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		rest, ok := strings.CutPrefix(r.URL.Path, "/api/v1/")
		if !ok {
			next.ServeHTTP(w, r)
			return
		}
		service, _, _ := strings.Cut(rest, "/")

		// Clients must never be able to set these.
		r.Header.Del(HeaderUserID)
		r.Header.Del(HeaderUserRoles)
		r.Header.Del(HeaderUserPhone)

		authz := r.Header.Get("Authorization")
		if p.IgnoreToken[service] || authz == "" {
			if p.Public[service] {
				next.ServeHTTP(w, r)
				return
			}
			unauthorized(w, "", "missing access token")
			return
		}

		token, ok := bearer(authz)
		if !ok {
			unauthorized(w, "invalid_request", "Authorization must be 'Bearer <token>'")
			return
		}
		claims, err := v.Verify(r.Context(), token)
		if err != nil {
			slog.Info("rejected access token", "path", r.URL.Path, "err", err)
			unauthorized(w, "invalid_token", "invalid or expired access token")
			return
		}

		r.Header.Set(HeaderUserID, claims.Subject)
		r.Header.Set(HeaderUserRoles, strings.Join(claims.Roles, ","))
		r.Header.Set(HeaderUserPhone, claims.Phone)
		next.ServeHTTP(w, r)
	})
}

func bearer(h string) (string, bool) {
	scheme, token, ok := strings.Cut(h, " ")
	token = strings.TrimSpace(token)
	return token, ok && strings.EqualFold(scheme, "Bearer") && token != ""
}

func unauthorized(w http.ResponseWriter, code, msg string) {
	challenge := `Bearer realm="foodkoala"`
	if code != "" {
		challenge += `, error="` + code + `"`
	}
	w.Header().Set("WWW-Authenticate", challenge)
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusUnauthorized)
	_, _ = w.Write([]byte(`{"error":"` + msg + `"}` + "\n"))
}
