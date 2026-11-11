package api_test

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/coder/websocket"

	"github.com/hassanshah0900/FoodKoala/src/chat-service/internal/api"
	"github.com/hassanshah0900/FoodKoala/src/chat-service/internal/chat"
	"github.com/hassanshah0900/FoodKoala/src/chat-service/internal/live"
	"github.com/hassanshah0900/FoodKoala/src/chat-service/internal/service"
	"github.com/hassanshah0900/FoodKoala/src/chat-service/internal/testenv"
)

type person struct{ id, phone, roles string }

var (
	customerID, riderID = testenv.NewID(), testenv.NewID()
	customer            = person{customerID, "+923000000023", "customer"}
	rider               = person{riderID, "+923000000031", "customer,rider"}
	stranger            = person{testenv.NewID(), "+923000000099", "customer"}
)

func (p person) headers(h http.Header) {
	h.Set("X-User-Id", p.id)
	h.Set("X-User-Phone", p.phone)
	h.Set("X-User-Roles", p.roles)
}

type harness struct {
	srv   *httptest.Server
	repo  *testenv.Repo
	order string
}

func newHarness(t *testing.T, announcer service.Announcer, hub *live.Hub) harness {
	h := harness{repo: testenv.NewRepo(), order: testenv.NewID()}
	h.repo.Open(h.order, customerID, riderID)
	svc := service.Service{Repo: h.repo, Photos: testenv.NewPhotos(), Live: announcer}
	h.srv = httptest.NewServer(api.New(api.Deps{
		Chats: svc, Hub: hub, Ready: func(context.Context) error { return nil },
		Resync: 50 * time.Millisecond, Ping: time.Hour,
	}))
	t.Cleanup(h.srv.Close)
	return h
}

func (h harness) do(t *testing.T, who person, method, path string, body io.Reader, contentType string) (*http.Response, []byte) {
	t.Helper()
	req, _ := http.NewRequest(method, h.srv.URL+path, body)
	if who.id != "" {
		who.headers(req.Header)
	}
	if contentType != "" {
		req.Header.Set("Content-Type", contentType)
	}
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()
	b, _ := io.ReadAll(res.Body)
	return res, b
}

func (h harness) send(t *testing.T, who person, clientID, text string) (*http.Response, []byte) {
	b, _ := json.Marshal(map[string]string{"clientId": clientID, "text": text})
	return h.do(t, who, "POST", "/orders/"+h.order+"/messages", bytes.NewReader(b), "application/json")
}

func TestHTTP(t *testing.T) {
	h := newHarness(t, &testenv.Announced{}, nil)
	if res, _ := h.do(t, person{}, "GET", "/orders/"+h.order, nil, ""); res.StatusCode != http.StatusUnauthorized {
		t.Fatalf("no identity: %d", res.StatusCode)
	}
	if res, _ := h.do(t, customer, "GET", "/orders/not-a-uuid", nil, ""); res.StatusCode != http.StatusBadRequest {
		t.Fatalf("bad id: %d", res.StatusCode)
	}
	if res, _ := h.do(t, stranger, "GET", "/orders/"+h.order, nil, ""); res.StatusCode != http.StatusNotFound {
		t.Fatalf("stranger: %d", res.StatusCode)
	}

	res, body := h.send(t, customer, "client-0001", "I'm at the gate")
	if res.StatusCode != http.StatusCreated {
		t.Fatalf("send: %d %s", res.StatusCode, body)
	}
	if res, _ := h.send(t, customer, "client-0001", "I'm at the gate"); res.StatusCode != http.StatusOK {
		t.Fatalf("retry: %d", res.StatusCode)
	}
	if res, _ := h.send(t, customer, "short", "hi"); res.StatusCode != http.StatusBadRequest {
		t.Fatalf("bad clientId: %d", res.StatusCode)
	}

	// A photo from the rider, then the customer opens it.
	var form bytes.Buffer
	mw := multipart.NewWriter(&form)
	_ = mw.WriteField("clientId", "client-photo")
	_ = mw.WriteField("caption", "Left it at the gate")
	fw, _ := mw.CreateFormFile("photo", "gate.jpg")
	_, _ = fw.Write(testenv.JPEG)
	_ = mw.Close()
	res, body = h.do(t, rider, "POST", "/orders/"+h.order+"/photos", &form, mw.FormDataContentType())
	if res.StatusCode != http.StatusCreated {
		t.Fatalf("photo: %d %s", res.StatusCode, body)
	}
	var m chat.Message
	_ = json.Unmarshal(body, &m)
	res, body = h.do(t, customer, "GET", "/orders/"+h.order+"/photos/"+m.Photo.ID, nil, "")
	if res.StatusCode != http.StatusOK || res.Header.Get("Content-Type") != "image/jpeg" || !bytes.Equal(body, testenv.JPEG) {
		t.Fatalf("open photo: %d %s", res.StatusCode, res.Header.Get("Content-Type"))
	}
	if !strings.HasPrefix(res.Header.Get("Cache-Control"), "private") {
		t.Fatal("photos are private")
	}

	if res, _ := h.do(t, rider, "POST", "/orders/"+h.order+"/read", nil, ""); res.StatusCode != http.StatusNoContent {
		t.Fatalf("read: %d", res.StatusCode)
	}
	res, body = h.do(t, customer, "GET", "/orders/"+h.order, nil, "")
	var v chat.View
	if err := json.Unmarshal(body, &v); err != nil || res.StatusCode != http.StatusOK {
		t.Fatal(err)
	}
	if v.Me != chat.Customer || len(v.Messages) != 2 || v.RiderReadAt == nil || v.Messages[1].Photo == nil {
		t.Fatalf("got %+v", v)
	}
	if res, _ := h.do(t, customer, "GET", "/orders/"+h.order+"/live", nil, ""); res.StatusCode != http.StatusUpgradeRequired {
		t.Fatalf("live needs a WebSocket: %d", res.StatusCode)
	}
}

// Against Redis: REDIS_URL=redis://localhost:6379 go test ./...
func TestLive(t *testing.T) {
	rdb := testenv.Redis(t)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	hub := live.NewHub(ctx, rdb)
	defer hub.Close()
	go hub.Run(ctx)
	h := newHarness(t, live.Publisher{Redis: rdb}, hub)

	dial := func(who person) *websocket.Conn {
		t.Helper()
		hdr := http.Header{}
		who.headers(hdr)
		conn, _, err := websocket.Dial(ctx, "ws"+strings.TrimPrefix(h.srv.URL, "http")+"/orders/"+h.order+"/live",
			&websocket.DialOptions{Subprotocols: []string{api.Subprotocol}, HTTPHeader: hdr})
		if err != nil {
			t.Fatal(err)
		}
		t.Cleanup(func() { _ = conn.CloseNow() })
		return conn
	}
	next := func(conn *websocket.Conn) chat.Event {
		t.Helper()
		rctx, done := context.WithTimeout(ctx, 5*time.Second)
		defer done()
		_, b, err := conn.Read(rctx)
		if err != nil {
			t.Fatal(err)
		}
		var e chat.Event
		_ = json.Unmarshal(b, &e)
		return e
	}

	c := dial(customer)
	if e := next(c); e.Type != "snapshot" || e.Chat.Me != chat.Customer || len(e.Chat.Messages) != 0 {
		t.Fatalf("first a snapshot: %+v", e)
	}
	if res, _ := h.send(t, rider, "client-live1", "Two minutes away"); res.StatusCode != http.StatusCreated {
		t.Fatal("send")
	}
	if e := next(c); e.Type != "message" || e.Message.Text != "Two minutes away" || e.Message.From != chat.Rider {
		t.Fatalf("then the message: %+v", e)
	}
	if e := next(c); e.Type != "read" || e.Role != chat.Rider {
		t.Fatalf("and the rider's read mark: %+v", e)
	}

	// Handed to another rider: the first one's socket is closed.
	r := dial(rider)
	_ = next(r)
	h.repo.Open(h.order, customerID, testenv.NewID())
	if err := (live.Publisher{Redis: rdb}).Announce(ctx, h.order, chat.Event{Type: "changed"}); err != nil {
		t.Fatal(err)
	}
	rctx, done := context.WithTimeout(ctx, 5*time.Second)
	defer done()
	for {
		if _, _, err := r.Read(rctx); err != nil {
			if websocket.CloseStatus(err) != websocket.StatusPolicyViolation {
				t.Fatalf("closed as no longer in the chat, got %v", err)
			}
			break
		}
	}
	if e := next(c); e.Type != "snapshot" {
		t.Fatalf("the customer gets the new chat: %+v", e)
	}
}
