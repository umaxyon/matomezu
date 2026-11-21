package main

import (
	"net"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/alecthomas/kong"
	"github.com/umaxyon/matomezu/internal/home"
)

// --port は、付けなければ「選んでいない」（nil）、付ければ 0 も選んだ値
func TestPortFlag(t *testing.T) {
	for _, c := range []struct {
		args []string
		want string
	}{
		{[]string{"start"}, "none"},
		{[]string{"start", "--port", "5301"}, "5301"},
		{[]string{"serve", "--port", "0"}, "0"},
	} {
		var cl cli
		p, err := kong.New(&cl)
		if err != nil {
			t.Fatal(err)
		}
		ctx, err := p.Parse(c.args)
		if err != nil {
			t.Fatal(err)
		}
		f := cl.Start.serverFlags
		if ctx.Command() == "serve" {
			f = cl.Serve.serverFlags
		}
		got := "none"
		if f.Port != nil {
			got = strings.Join(f.args(), " ")
			got = strings.TrimPrefix(got, "--port ")
		}
		if got != c.want {
			t.Errorf("%v: port %q, want %q", c.args, got, c.want)
		}
	}
}

func openTestHome(t *testing.T, dir string) *home.Home {
	t.Helper()
	h, err := home.Open(dir)
	if err != nil {
		t.Fatal(err)
	}
	return h
}

// 待つポートは、選んだ物 → 保管庫が覚えた物 → 既定（開発の保管庫 .dev-home は 5300、ほかは 7230）の順
func TestListenPortOrder(t *testing.T) {
	user := openTestHome(t, filepath.Join(t.TempDir(), "matomezu"))
	dev := openTestHome(t, filepath.Join(t.TempDir(), devHomeDir))
	port := func(h *home.Home, chosen *int) int {
		t.Helper()
		p, err := listenPort(h, chosen)
		if err != nil {
			t.Fatal(err)
		}
		return p
	}
	if got := port(user, nil); got != DefaultPort {
		t.Errorf("user vault default = %d", got)
	}
	if got := port(dev, nil); got != devPort {
		t.Errorf("development vault default = %d", got)
	}
	if err := dev.WritePort(5301); err != nil {
		t.Fatal(err)
	}
	if got := port(dev, nil); got != 5301 {
		t.Errorf("kept = %d, want 5301", got)
	}
	chosen := 5302
	if got := port(dev, &chosen); got != 5302 {
		t.Errorf("chosen = %d, want 5302", got)
	}
}

// ほかが使っているポートを選ぶと、使用中と言って断り、そのポートは覚えない
func TestServeRefusesAPortInUse(t *testing.T) {
	l, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer l.Close()
	busy := l.Addr().(*net.TCPAddr).Port
	dir := filepath.Join(t.TempDir(), "vault")
	t.Setenv(home.EnvHome, dir)
	c := serveCmd{serverFlags{Port: &busy, Web: t.TempDir()}}
	err = c.Run()
	if err == nil || !strings.Contains(err.Error(), "is in use") || !strings.Contains(err.Error(), "--port") {
		t.Fatalf("err = %v", err)
	}
	if kept, err := openTestHome(t, dir).ReadPort(); err != nil || kept != 0 {
		t.Errorf("kept %d, %v: a port that could not be used is not kept", kept, err)
	}
}

// 立っている常駐と別のポートを選んだら断る（止めて立て直さない）。同じポート・選ばないなら、立っている常駐を使う
func TestEnsureRefusesAnotherPortWhileRunning(t *testing.T) {
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.Write([]byte(`{}`)) }))
	defer ts.Close()
	h := openTestHome(t, t.TempDir())
	lock, err := h.Lock()
	if err != nil {
		t.Fatal(err)
	}
	defer lock.Unlock()
	if err := h.WriteServer(home.Server{URL: ts.URL + "/", Token: "t"}); err != nil {
		t.Fatal(err)
	}
	same := serverPort(&home.Server{URL: ts.URL + "/"})
	other := same + 1
	if _, err := ensure(h, serverFlags{Port: &other}); err == nil || !strings.Contains(err.Error(), "stop it first") || !strings.Contains(err.Error(), h.Dir) {
		t.Fatalf("another port: %v", err)
	}
	for _, f := range []serverFlags{{Port: &same}, {}} {
		if s, err := ensure(h, f); err != nil || s == nil {
			t.Errorf("%v: %v, %v", f.args(), s, err)
		}
	}
}

// 立ち上げの失敗に出す理由は、今回書かれた分の最後の行（頭の error: は外す）
func TestLastLineOfThisStart(t *testing.T) {
	path := filepath.Join(t.TempDir(), "server.log")
	old := "error: an old failure\n"
	if err := os.WriteFile(path, []byte(old+"starting\nerror: port 7230 is in use\n\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	if got := lastLogLine(path, int64(len(old))); got != "port 7230 is in use" {
		t.Errorf("got %q", got)
	}
	if got := lastLogLine(path, 1<<20); got != "" {
		t.Errorf("past the end = %q", got)
	}
}

// 覚えるのは利用者が選んだポートだけ（選んでいない・0 は覚えない）
func TestKeepPortOnlyWhenChosen(t *testing.T) {
	h := openTestHome(t, t.TempDir())
	zero, chosen := 0, 5301
	for _, p := range []*int{nil, &zero} {
		if err := keepPort(h, p); err != nil {
			t.Fatal(err)
		}
		if kept, _ := h.ReadPort(); kept != 0 {
			t.Fatalf("kept %d", kept)
		}
	}
	if err := keepPort(h, &chosen); err != nil {
		t.Fatal(err)
	}
	if kept, _ := h.ReadPort(); kept != 5301 {
		t.Errorf("kept %d, want 5301", kept)
	}
}
