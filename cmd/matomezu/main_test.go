package main

import (
	"errors"
	"net"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/umaxyon/matomezu/internal/home"
)

// fakeServer は合言葉 token のときだけ status で答える常駐。呼ばれた数を数える
func fakeServer(t *testing.T, token string, status int, calls *int) *home.Server {
	t.Helper()
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		*calls++
		if r.Header.Get("Authorization") != "Bearer "+token {
			w.WriteHeader(http.StatusUnauthorized)
			return
		}
		w.WriteHeader(status)
		w.Write([]byte(`{"ok":true}`))
	}))
	t.Cleanup(ts.Close)
	return &home.Server{URL: ts.URL + "/", Token: token}
}

// closedServer は、もう誰も待っていないアドレス（立て直す前の常駐）
func closedServer(t *testing.T) *home.Server {
	t.Helper()
	l, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	addr := l.Addr().String()
	l.Close()
	return &home.Server{URL: "http://" + addr + "/", Token: "old"}
}

func TestStaleTokenIsReadAgainOnce(t *testing.T) {
	var calls, reconnects int
	now := fakeServer(t, "new", http.StatusOK, &calls)
	a := &httpAPI{
		s:         &home.Server{URL: now.URL, Token: "old"},
		reconnect: func() (*home.Server, error) { reconnects++; return now, nil },
	}
	out, err := a.Post("api/ai/perform", map[string]string{"x": "y"})
	if err != nil || string(out) != `{"ok":true}` {
		t.Fatalf("got %s, %v", out, err)
	}
	if reconnects != 1 || calls != 2 {
		t.Fatalf("reconnects %d, calls %d", reconnects, calls)
	}
	if _, err := a.Get("api/ai/books"); err != nil || reconnects != 1 {
		t.Fatalf("the new token is kept: %v, reconnects %d", err, reconnects)
	}
}

func TestStoppedServerIsStartedAgain(t *testing.T) {
	var calls, reconnects int
	now := fakeServer(t, "new", http.StatusOK, &calls)
	a := &httpAPI{
		s:         closedServer(t),
		reconnect: func() (*home.Server, error) { reconnects++; return now, nil },
	}
	if _, err := a.Get("api/ai/books"); err != nil {
		t.Fatal(err)
	}
	if reconnects != 1 || calls != 1 {
		t.Fatalf("reconnects %d, calls %d", reconnects, calls)
	}
}

func TestRetriesOnlyOnce(t *testing.T) {
	var calls, reconnects int
	s := fakeServer(t, "new", http.StatusOK, &calls)
	wrong := &home.Server{URL: s.URL, Token: "wrong"}
	a := &httpAPI{s: wrong, reconnect: func() (*home.Server, error) { reconnects++; return wrong, nil }}
	if _, err := a.Get("api/ai/books"); err == nil {
		t.Fatal("still unauthorized after reading again")
	}
	if reconnects != 1 || calls != 2 {
		t.Fatalf("reconnects %d, calls %d", reconnects, calls)
	}
}

func TestOtherFailuresAreNotRetried(t *testing.T) {
	var calls, reconnects int
	s := fakeServer(t, "new", http.StatusInternalServerError, &calls)
	a := &httpAPI{s: s, reconnect: func() (*home.Server, error) { reconnects++; return s, nil }}
	if _, err := a.Post("api/ai/perform", nil); err == nil {
		t.Fatal("a 500 is an error")
	}
	if reconnects != 0 || calls != 1 {
		t.Fatalf("reconnects %d, calls %d", reconnects, calls)
	}
}

func TestReconnectFailureIsReported(t *testing.T) {
	a := &httpAPI{
		s:         closedServer(t),
		reconnect: func() (*home.Server, error) { return nil, errors.New("the server did not start") },
	}
	_, err := a.Get("api/ai/books")
	if err == nil || !strings.Contains(err.Error(), "the server did not start") {
		t.Fatalf("got %v", err)
	}
}
