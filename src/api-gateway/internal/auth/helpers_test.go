package auth

import (
	"crypto"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"math/big"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
	"time"
)

var b64 = base64.RawURLEncoding

type testKey struct {
	kid  string
	priv *rsa.PrivateKey
}

func newKey(t *testing.T, kid string) testKey {
	t.Helper()
	priv, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatal(err)
	}
	return testKey{kid: kid, priv: priv}
}

func (k testKey) jwk() map[string]string {
	return map[string]string{
		"kty": "RSA", "kid": k.kid, "alg": "RS256", "use": "sig",
		"n": b64.EncodeToString(k.priv.N.Bytes()),
		"e": b64.EncodeToString(big.NewInt(int64(k.priv.E)).Bytes()),
	}
}

// sign builds a JWT with the given header and claims, signed RS256 by k.
func (k testKey) sign(t *testing.T, header map[string]any, claims map[string]any) string {
	t.Helper()
	h, _ := json.Marshal(header)
	c, _ := json.Marshal(claims)
	unsigned := b64.EncodeToString(h) + "." + b64.EncodeToString(c)
	digest := sha256.Sum256([]byte(unsigned))
	sig, err := rsa.SignPKCS1v15(rand.Reader, k.priv, crypto.SHA256, digest[:])
	if err != nil {
		t.Fatal(err)
	}
	return unsigned + "." + b64.EncodeToString(sig)
}

// token is a valid access token as auth-service issues it, with optional overrides.
func (k testKey) token(t *testing.T, now time.Time, overrides map[string]any) string {
	claims := map[string]any{
		"sub":   "7d3c8f8e-3a0e-4c55-9a6b-3f1c2b8a9d10",
		"iss":   "foodkoala-auth",
		"aud":   "foodkoala",
		"iat":   now.Unix(),
		"exp":   now.Add(15 * time.Minute).Unix(),
		"phone": "+923001234567",
		"roles": []string{"customer"},
	}
	for name, v := range overrides {
		if v == nil {
			delete(claims, name)
		} else {
			claims[name] = v
		}
	}
	return k.sign(t, map[string]any{"alg": "RS256", "kid": k.kid, "typ": "JWT"}, claims)
}

// jwksServer serves the keys in *keys (swap them to simulate rotation) and counts hits.
type jwksServer struct {
	*httptest.Server
	keys atomic.Pointer[[]testKey]
	hits atomic.Int32
	down atomic.Bool
}

func newJWKSServer(t *testing.T, keys ...testKey) *jwksServer {
	s := &jwksServer{}
	s.keys.Store(&keys)
	s.Server = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		s.hits.Add(1)
		if s.down.Load() {
			http.Error(w, "down", http.StatusServiceUnavailable)
			return
		}
		set := []map[string]string{}
		for _, k := range *s.keys.Load() {
			set = append(set, k.jwk())
		}
		_ = json.NewEncoder(w).Encode(map[string]any{"keys": set})
	}))
	t.Cleanup(s.Close)
	return s
}

// fakeClock lets tests move time forward.
type fakeClock struct{ t time.Time }

func (c *fakeClock) Now() time.Time          { return c.t }
func (c *fakeClock) Advance(d time.Duration) { c.t = c.t.Add(d) }
