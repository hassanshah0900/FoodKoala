package auth

import (
	"context"
	"errors"
	"testing"
	"time"
)

func newTestJWKS(url string, clock *fakeClock) *JWKS {
	j := NewJWKS(url)
	j.Now = clock.Now
	return j
}

func TestJWKSCachesKeys(t *testing.T) {
	key := newKey(t, "k1")
	srv := newJWKSServer(t, key)
	clock := &fakeClock{t: time.Unix(1_800_000_000, 0)}
	j := newTestJWKS(srv.URL, clock)

	for range 3 {
		got, err := j.Key(context.Background(), "k1")
		if err != nil {
			t.Fatal(err)
		}
		if got.N.Cmp(key.priv.N) != 0 {
			t.Fatal("wrong key")
		}
	}
	if srv.hits.Load() != 1 {
		t.Fatalf("fetched %d times, want 1", srv.hits.Load())
	}

	clock.Advance(6 * time.Minute) // past TTL
	if _, err := j.Key(context.Background(), "k1"); err != nil {
		t.Fatal(err)
	}
	if srv.hits.Load() != 2 {
		t.Fatalf("fetched %d times after TTL, want 2", srv.hits.Load())
	}
}

func TestJWKSPicksUpRotatedKey(t *testing.T) {
	old, rotated := newKey(t, "old"), newKey(t, "new")
	srv := newJWKSServer(t, old)
	clock := &fakeClock{t: time.Unix(1_800_000_000, 0)}
	j := newTestJWKS(srv.URL, clock)

	if _, err := j.Key(context.Background(), "old"); err != nil {
		t.Fatal(err)
	}
	srv.keys.Store(&[]testKey{old, rotated})
	clock.Advance(11 * time.Second) // past MinRefresh, well within TTL

	if _, err := j.Key(context.Background(), "new"); err != nil {
		t.Fatalf("rotated key not found: %v", err)
	}
}

func TestJWKSUnknownKidDoesNotHammerAuthService(t *testing.T) {
	srv := newJWKSServer(t, newKey(t, "k1"))
	clock := &fakeClock{t: time.Unix(1_800_000_000, 0)}
	j := newTestJWKS(srv.URL, clock)

	for range 50 {
		if _, err := j.Key(context.Background(), "forged"); !errors.Is(err, ErrUnknownKey) {
			t.Fatalf("got %v, want ErrUnknownKey", err)
		}
	}
	if srv.hits.Load() != 1 {
		t.Fatalf("fetched %d times, want 1 (rate limited)", srv.hits.Load())
	}
}

func TestJWKSKeepsStaleKeysWhenAuthServiceIsDown(t *testing.T) {
	srv := newJWKSServer(t, newKey(t, "k1"))
	clock := &fakeClock{t: time.Unix(1_800_000_000, 0)}
	j := newTestJWKS(srv.URL, clock)

	if _, err := j.Key(context.Background(), "k1"); err != nil {
		t.Fatal(err)
	}
	srv.down.Store(true)
	clock.Advance(time.Hour)

	if _, err := j.Key(context.Background(), "k1"); err != nil {
		t.Fatalf("stale key should still work during an outage: %v", err)
	}
}

func TestJWKSIgnoresUnusableKeys(t *testing.T) {
	small := newKey(t, "ok")
	srv := newJWKSServer(t, small)
	j := newTestJWKS(srv.URL, &fakeClock{t: time.Unix(1_800_000_000, 0)})

	if _, err := rsaKey(b64.EncodeToString([]byte{0x01, 0x02}), "AQAB"); err == nil {
		t.Fatal("accepted a tiny modulus")
	}
	if _, err := j.Key(context.Background(), "ok"); err != nil {
		t.Fatal(err)
	}
}

func TestJWKSReadyOnceKeysAreFetched(t *testing.T) {
	srv := newJWKSServer(t, newKey(t, "k1"))
	srv.down.Store(true)
	clock := &fakeClock{t: time.Unix(1_800_000_000, 0)}
	j := newTestJWKS(srv.URL, clock)

	if err := j.Ready(context.Background()); err == nil {
		t.Fatal("ready without any keys")
	}
	// A probe right after a failed fetch doesn't try again.
	if err := j.Ready(context.Background()); err == nil || srv.hits.Load() != 1 {
		t.Fatalf("want a throttled failure after 1 hit, got err=%v hits=%d", err, srv.hits.Load())
	}

	srv.down.Store(false)
	clock.Advance(j.MinRefresh)
	if err := j.Ready(context.Background()); err != nil {
		t.Fatal(err)
	}
	// The keys it fetched are the ones tokens are checked with.
	if _, err := j.Key(context.Background(), "k1"); err != nil || srv.hits.Load() != 2 {
		t.Fatalf("want the cached key, got err=%v hits=%d", err, srv.hits.Load())
	}

	// Once it has keys, an auth-service outage doesn't make it unready.
	srv.down.Store(true)
	clock.Advance(time.Hour)
	if err := j.Ready(context.Background()); err != nil {
		t.Fatalf("stale keys should keep it ready: %v", err)
	}
}
