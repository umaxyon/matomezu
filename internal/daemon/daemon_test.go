package daemon

import (
	"context"
	"net/http/httptest"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
	"testing/fstest"

	"github.com/umaxyon/matomezu/internal/server"
)

func home(t *testing.T) string {
	t.Helper()
	d := t.TempDir()
	t.Setenv("MATOMEZU_HOME", d)
	return d
}

func TestStateRoundTripAndPermissions(t *testing.T) {
	d := home(t)
	if s, err := ReadState(); s != nil || err != nil {
		t.Fatalf("empty state = %v, %v", s, err)
	}
	want := &State{PID: 42, Addr: "127.0.0.1:1", Token: NewToken(), Version: "v1"}
	if err := WriteState(want); err != nil {
		t.Fatal(err)
	}
	got, err := ReadState()
	if err != nil || *got != *want {
		t.Fatalf("state = %+v, %v", got, err)
	}
	if runtime.GOOS != "windows" {
		st, _ := os.Stat(filepath.Join(d, "server.json"))
		if st.Mode().Perm() != 0o600 {
			t.Fatalf("mode = %v", st.Mode().Perm())
		}
	}
}

func TestBrokenStateIsIgnored(t *testing.T) {
	d := home(t)
	os.WriteFile(filepath.Join(d, "server.json"), []byte("{broken"), 0o600)
	if s, err := ReadState(); s != nil || err != nil {
		t.Fatalf("broken state = %v, %v", s, err)
	}
}

func TestRemoveStateOnlyOwnPID(t *testing.T) {
	d := home(t)
	WriteState(&State{PID: 1, Addr: "a", Token: "t", Version: "v"})
	RemoveState(2) // 別のサーバーの分は消さない
	if _, err := os.Stat(filepath.Join(d, "server.json")); err != nil {
		t.Fatal("removed state of another pid")
	}
	RemoveState(1)
	if _, err := os.Stat(filepath.Join(d, "server.json")); !os.IsNotExist(err) {
		t.Fatal("state not removed")
	}
}

func TestNewTokenIsRandom(t *testing.T) {
	a, b := NewToken(), NewToken()
	if len(a) != 48 || a == b {
		t.Fatalf("tokens %q %q", a, b)
	}
}

// 制御用 API を持つ Hub を立て、その状態を返す
func serve(t *testing.T, pid int) *State {
	t.Helper()
	ctx, cancel := context.WithCancel(context.Background())
	t.Cleanup(cancel)
	token := NewToken()
	hub := server.NewHub(ctx, fstest.MapFS{"index.html": {Data: []byte("x")}}, server.WithControl(token, "v1", func() {}))
	ts := httptest.NewServer(hub.Handler())
	t.Cleanup(ts.Close)
	return &State{PID: pid, Addr: strings.TrimPrefix(ts.URL, "http://"), Token: token, Version: "v1"}
}

func TestPingOpenAndRunning(t *testing.T) {
	home(t)
	s := serve(t, os.Getpid())
	if v, err := Ping(s); err != nil || v != "v1" {
		t.Fatalf("ping = %q, %v", v, err)
	}
	res, err := Open(s, filepath.Join(t.TempDir(), "d.json"))
	if err != nil || res.ID == "" {
		t.Fatalf("open = %+v, %v", res, err)
	}
	if Running() != nil {
		t.Fatal("running without a state file")
	}
	WriteState(s)
	if r := Running(); r == nil || r.Addr != s.Addr {
		t.Fatalf("running = %+v", r)
	}
}

func TestPingRejectsMismatchAndBadToken(t *testing.T) {
	home(t)
	s := serve(t, os.Getpid())
	other := *s
	other.PID = os.Getpid() + 1 // 状態ファイルが別のサーバーのもの
	if _, err := Ping(&other); err == nil {
		t.Fatal("ping accepted a pid mismatch")
	}
	bad := *s
	bad.Token = "wrong"
	if _, err := Ping(&bad); err == nil {
		t.Fatal("ping accepted a wrong token")
	}
	WriteState(&other)
	if Running() != nil {
		t.Fatal("running accepted a pid mismatch")
	}
}
