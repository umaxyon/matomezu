package peer

import (
	"errors"
	"io"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func newIdentity(t *testing.T) *Identity {
	t.Helper()
	id, err := LoadOrCreate(filepath.Join(t.TempDir(), "host.key"))
	if err != nil {
		t.Fatal(err)
	}
	return id
}

func TestLoadOrCreateKeepsTheHostID(t *testing.T) {
	path := filepath.Join(t.TempDir(), "sub", "host.key")
	a, err := LoadOrCreate(path)
	if err != nil {
		t.Fatal(err)
	}
	b, err := LoadOrCreate(path)
	if err != nil {
		t.Fatal(err)
	}
	if a.HostID != b.HostID || len(a.HostID) != 64 {
		t.Fatalf("host id changed or wrong: %q %q", a.HostID, b.HostID)
	}
	if info, err := os.Stat(path); err != nil || (info.Mode().Perm()&0o077 != 0 && os.PathSeparator == '/') {
		t.Fatalf("key file should be private: %v %v", info.Mode(), err)
	}
	if other := newIdentity(t); other.HostID == a.HostID {
		t.Fatal("two keys gave the same host id")
	}
}

func TestLoadOrCreateRefusesABrokenKey(t *testing.T) {
	path := filepath.Join(t.TempDir(), "host.key")
	if err := os.WriteFile(path, []byte("nope"), 0o600); err != nil {
		t.Fatal(err)
	}
	if _, err := LoadOrCreate(path); err == nil {
		t.Fatal("a broken key was read")
	}
}

// serve は、id の入口を 127.0.0.1 の空いているポートで立て、番地を返す
func serve(t *testing.T, id *Identity, h http.Handler) string {
	t.Helper()
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	srv := Server(id, h)
	go srv.ServeTLS(ln, "", "")
	t.Cleanup(func() { srv.Close() })
	return "https://" + ln.Addr().String()
}

func get(t *testing.T, c *http.Client, url string) (int, string, error) {
	t.Helper()
	res, err := c.Get(url)
	if err != nil {
		return 0, "", err
	}
	defer res.Body.Close()
	b, _ := io.ReadAll(res.Body)
	return res.StatusCode, string(b), nil
}

func TestPinnedTakesOnlyKnownHostsAndUnpinnedTakesAny(t *testing.T) {
	a, b, stranger := newIdentity(t), newIdentity(t), newIdentity(t)
	mux := http.NewServeMux()
	mux.Handle("GET /pinned", Pinned(Protocol, func(id string) bool { return id == b.HostID }, func(w http.ResponseWriter, r *http.Request) {
		id, _ := RequestHost(r)
		io.WriteString(w, id)
	}))
	mux.Handle("GET /unpinned", Unpinned(Protocol, func(w http.ResponseWriter, r *http.Request) { io.WriteString(w, "ok") }))
	url := serve(t, a, mux)

	code, body, err := get(t, Client(b, a.HostID, Protocol, 5*time.Second), url+"/pinned")
	if err != nil || code != 200 || body != b.HostID {
		t.Fatalf("paired host: %d %q %v", code, body, err)
	}
	if _, _, err := get(t, Client(stranger, a.HostID, Protocol, 5*time.Second), url+"/pinned"); !errors.Is(err, ErrNotPaired) {
		t.Fatalf("unknown key should be answered not paired: %v", err)
	}
	if code, body, err := get(t, Client(stranger, "", Protocol, 5*time.Second), url+"/unpinned"); err != nil || code != 200 || body != "ok" {
		t.Fatalf("unpinned: %d %q %v", code, body, err)
	}
}

// どちらの包みも、ペアリングしているかより先に常駐間通信プロトコルの版を見て断り、Client はその断りを相手の版の付いた error にする。
// 版を名乗らない頼み（Client を通さない物）も断る。包みの答えでない 409（ペアリングの断りなど）は、本文ごとそのまま返す
func TestBothWrappersRefuseAnotherProtocolFirst(t *testing.T) {
	a, b, stranger := newIdentity(t), newIdentity(t), newIdentity(t)
	mux := http.NewServeMux()
	mux.Handle("GET /pinned", Pinned(Protocol, func(id string) bool { return id == b.HostID }, func(w http.ResponseWriter, r *http.Request) { io.WriteString(w, "ok") }))
	mux.Handle("GET /unpinned", Unpinned(Protocol, func(w http.ResponseWriter, r *http.Request) { io.WriteString(w, "ok") }))
	mux.Handle("GET /refusing", Unpinned(Protocol, func(w http.ResponseWriter, r *http.Request) { http.Error(w, `{"reason":"busy"}`, http.StatusConflict) }))
	url := serve(t, a, mux)

	for _, c := range []struct {
		name   string
		id     *Identity
		proto  int
		path   string
		theirs int // 0 なら版の断りでない
	}{
		{"newer asks pinned", b, Protocol + 1, "/pinned", Protocol},
		{"older asks pinned", b, Protocol - 1, "/pinned", Protocol},
		{"not paired and newer", stranger, Protocol + 1, "/pinned", Protocol},
		{"newer asks unpinned", stranger, Protocol + 1, "/unpinned", Protocol},
	} {
		_, _, err := get(t, Client(c.id, "", c.proto, 5*time.Second), url+c.path)
		var pm ProtocolMismatchError
		if !errors.As(err, &pm) || pm.Theirs != c.theirs || pm.Ours != c.proto || pm.TheirsNewer() != (c.theirs > c.proto) {
			t.Fatalf("%s: want protocol mismatch, got %v", c.name, err)
		}
	}

	bare := &http.Client{Timeout: 5 * time.Second, Transport: &http.Transport{TLSClientConfig: ClientConfig(b, "")}}
	if code, body, err := get(t, bare, url+"/pinned"); err != nil || code != http.StatusConflict || strings.TrimSpace(body) != protocolMismatch {
		t.Fatalf("a request without the protocol: %d %q %v", code, body, err)
	}
	if code, body, err := get(t, Client(b, "", Protocol, 5*time.Second), url+"/refusing"); err != nil || code != http.StatusConflict || strings.TrimSpace(body) != `{"reason":"busy"}` {
		t.Fatalf("another 409 should come back as it is: %d %q %v", code, body, err)
	}
}

func TestClientRefusesAHostWhoseKeyDoesNotMatch(t *testing.T) {
	a, b, other := newIdentity(t), newIdentity(t), newIdentity(t)
	url := serve(t, a, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {}))
	_, _, err := get(t, Client(b, other.HostID, Protocol, 5*time.Second), url+"/")
	if err == nil || !errors.Is(err, ErrKeyMismatch) && !strings.Contains(err.Error(), ErrKeyMismatch.Error()) {
		t.Fatalf("want key mismatch, got %v", err)
	}
}

func TestServerRefusesAClientWithoutAKey(t *testing.T) {
	a := newIdentity(t)
	url := serve(t, a, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {}))
	cfg := ClientConfig(a, a.HostID)
	cfg.Certificates = nil
	c := &http.Client{Timeout: 5 * time.Second, Transport: &http.Transport{TLSClientConfig: cfg}}
	if _, _, err := get(t, c, url+"/"); err == nil {
		t.Fatal("a client without a certificate got in")
	}
}
