// Package auth verifies auth-service access tokens (ADR 0004, ADR 0005).
package auth

import (
	"context"
	"crypto/rsa"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"math/big"
	"net/http"
	"sync"
	"time"
)

// ErrUnknownKey means no key with the token's kid is published.
var ErrUnknownKey = errors.New("unknown signing key")

// JWKS fetches and caches the RSA public keys published by auth-service.
//
// Keys are refetched after TTL, or early when a token names an unknown kid
// (key rotation), but never more often than MinRefresh. If auth-service is
// unreachable, the last known keys keep working.
type JWKS struct {
	URL        string
	Client     *http.Client
	TTL        time.Duration
	MinRefresh time.Duration
	Now        func() time.Time

	mu          sync.Mutex
	keys        map[string]*rsa.PublicKey
	fetchedAt   time.Time
	lastAttempt time.Time
}

// NewJWKS returns a cache with production defaults.
func NewJWKS(url string) *JWKS {
	return &JWKS{
		URL:        url,
		Client:     &http.Client{Timeout: 3 * time.Second},
		TTL:        5 * time.Minute,
		MinRefresh: 10 * time.Second,
		Now:        time.Now,
	}
}

// Key returns the public key with the given kid.
func (j *JWKS) Key(ctx context.Context, kid string) (*rsa.PublicKey, error) {
	j.mu.Lock()
	defer j.mu.Unlock()

	now := j.Now()
	key, found := j.keys[kid]
	if found && now.Sub(j.fetchedAt) < j.TTL {
		return key, nil
	}

	if now.Sub(j.lastAttempt) >= j.MinRefresh {
		j.lastAttempt = now
		if keys, err := j.fetch(ctx); err != nil {
			slog.Warn("jwks refresh failed, using cached keys", "url", j.URL, "err", err, "cached", len(j.keys))
		} else {
			j.keys, j.fetchedAt = keys, now
			key, found = keys[kid]
		}
	}

	if !found {
		return nil, fmt.Errorf("%w: kid %q", ErrUnknownKey, kid)
	}
	return key, nil
}

type jwk struct {
	Kty string `json:"kty"`
	Kid string `json:"kid"`
	Use string `json:"use"`
	Alg string `json:"alg"`
	N   string `json:"n"`
	E   string `json:"e"`
}

func (j *JWKS) fetch(ctx context.Context) (map[string]*rsa.PublicKey, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, j.URL, nil)
	if err != nil {
		return nil, err
	}
	res, err := j.Client.Do(req)
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("jwks: status %d", res.StatusCode)
	}

	var set struct {
		Keys []jwk `json:"keys"`
	}
	if err := json.NewDecoder(io.LimitReader(res.Body, 1<<20)).Decode(&set); err != nil {
		return nil, fmt.Errorf("jwks: %w", err)
	}

	keys := make(map[string]*rsa.PublicKey, len(set.Keys))
	for _, k := range set.Keys {
		if k.Kty != "RSA" || k.Kid == "" || (k.Use != "" && k.Use != "sig") || (k.Alg != "" && k.Alg != "RS256") {
			continue
		}
		pub, err := rsaKey(k.N, k.E)
		if err != nil {
			slog.Warn("jwks: skipping invalid key", "kid", k.Kid, "err", err)
			continue
		}
		keys[k.Kid] = pub
	}
	if len(keys) == 0 {
		return nil, errors.New("jwks: no usable RS256 keys")
	}
	return keys, nil
}

func rsaKey(n, e string) (*rsa.PublicKey, error) {
	nb, err := base64.RawURLEncoding.DecodeString(n)
	if err != nil {
		return nil, fmt.Errorf("n: %w", err)
	}
	eb, err := base64.RawURLEncoding.DecodeString(e)
	if err != nil {
		return nil, fmt.Errorf("e: %w", err)
	}
	exp := new(big.Int).SetBytes(eb)
	if !exp.IsInt64() || exp.Int64() < 3 || exp.Int64() > 1<<31-1 {
		return nil, errors.New("e out of range")
	}
	pub := &rsa.PublicKey{N: new(big.Int).SetBytes(nb), E: int(exp.Int64())}
	if pub.N.BitLen() < 2048 {
		return nil, errors.New("modulus shorter than 2048 bits")
	}
	return pub, nil
}
