package peer

import (
	"context"
	"errors"
	"io"
	"net"
	"net/http"
	"strings"
	"sync"
	"testing"
	"time"
)

// reverseHost は、リバース接続を受けるホスト B の入口（本物の Server と Pinned）。受けた接続は accepted に渡す
func reverseHost(t *testing.T, b *Identity, proto int, known func(string) bool) (addr string, accepted chan net.Conn) {
	t.Helper()
	accepted = make(chan net.Conn, 1)
	mux := http.NewServeMux()
	mux.Handle("POST "+ReversePath, Pinned(proto, known, func(w http.ResponseWriter, r *http.Request) {
		if conn, err := AcceptReverse(w, r); err == nil {
			accepted <- conn
		}
	}))
	return strings.TrimPrefix(serve(t, b, mux), "https://"), accepted
}

func TestReverseCarriesRequestsFromTheHostItReached(t *testing.T) {
	a, b := newIdentity(t), newIdentity(t)
	addr, accepted := reverseHost(t, b, Protocol, func(id string) bool { return id == a.HostID })
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	conn, err := DialReverse(ctx, a, b.HostID, Protocol, addr)
	if err != nil {
		t.Fatal(err)
	}
	served := make(chan error, 1)
	answer := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		from, _ := RequestHost(r)
		io.WriteString(w, from)
	})
	go func() { served <- ServeReverse(ctx, conn, a, b.HostID, answer) }()
	c, done, err := ReverseClient(ctx, <-accepted, b, a.HostID, Protocol, 5*time.Second)
	if err != nil {
		t.Fatal(err)
	}
	var wg sync.WaitGroup
	for range 5 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			_, body, err := get(t, c, "https://reverse/hello")
			if err != nil {
				t.Error(err)
			} else if body != b.HostID {
				t.Errorf("A read the request as from %q, want B", body)
			}
		}()
	}
	wg.Wait()
	cancel()
	select {
	case <-done:
	case <-time.After(5 * time.Second):
		t.Fatal("B did not see the connection close")
	}
	if ReverseOpen(c) {
		t.Fatal("B can still send on a closed connection")
	}
	<-served
}

func TestReverseRefusesAnotherKeyInside(t *testing.T) {
	a, b, other := newIdentity(t), newIdentity(t), newIdentity(t)
	addr, accepted := reverseHost(t, b, Protocol, func(id string) bool { return id == a.HostID })
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	conn, err := DialReverse(ctx, a, b.HostID, Protocol, addr)
	if err != nil {
		t.Fatal(err)
	}
	served := make(chan error, 1)
	go func() { served <- ServeReverse(ctx, conn, a, b.HostID, http.NotFoundHandler()) }()
	// TLS 1.3 では、クライアントは A が鍵を断る前に結べたと思うことがある。断るのは A の側
	if c, _, err := ReverseClient(ctx, <-accepted, other, a.HostID, Protocol, 5*time.Second); err == nil {
		if _, _, err := get(t, c, "https://reverse/hello"); err == nil {
			t.Fatal("a key other than B's was answered inside")
		}
	}
	if err := <-served; !errors.Is(err, ErrKeyMismatch) {
		t.Fatalf("A served a key other than B's: %v", err)
	}
}

func TestDialReverseTurnsRefusalsIntoErrors(t *testing.T) {
	a, b := newIdentity(t), newIdentity(t)
	addr, _ := reverseHost(t, b, Protocol, func(string) bool { return false })
	if _, err := DialReverse(context.Background(), a, b.HostID, Protocol, addr); !errors.Is(err, ErrNotPaired) {
		t.Fatalf("not paired: %v", err)
	}
	var pm ProtocolMismatchError
	if _, err := DialReverse(context.Background(), a, b.HostID, Protocol+1, addr); !errors.As(err, &pm) || pm.Theirs != Protocol {
		t.Fatalf("another protocol: %v", err)
	}
}
