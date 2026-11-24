package main

import (
	"net/http"
	"net/http/httptest"
	"slices"
	"strings"
	"sync"
	"testing"

	"github.com/umaxyon/matomezu/internal/home"
)

// fakeResident は、ping と stop に答える常駐の代わり（stop のあとは答えない。onStop があれば stop で呼ぶ）
type fakeResident struct {
	ts      *httptest.Server
	mu      sync.Mutex
	stopped bool
}

func newFakeResident(t *testing.T, onStop func()) *fakeResident {
	t.Helper()
	f := &fakeResident{}
	f.ts = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		f.mu.Lock()
		defer f.mu.Unlock()
		if f.stopped {
			w.WriteHeader(http.StatusServiceUnavailable)
			return
		}
		if r.URL.Path == "/api/stop" {
			f.stopped = true
			if onStop != nil {
				onStop()
			}
		}
		w.Write([]byte(`{}`))
	}))
	t.Cleanup(f.ts.Close)
	return f
}

func (f *fakeResident) wasStopped() bool {
	f.mu.Lock()
	defer f.mu.Unlock()
	return f.stopped
}

// otherVault は、ほかの OS の常駐の保管庫の代わり（server.json に version の常駐 f のつなぎ方を書く。f が nil なら書かない）
func otherVault(t *testing.T, f *fakeResident, version string) string {
	t.Helper()
	dir := t.TempDir()
	if f != nil {
		if err := openTestHome(t, dir).WriteServer(home.Server{URL: f.ts.URL + "/", Token: "t", Version: version}); err != nil {
			t.Fatal(err)
		}
	}
	return dir
}

// ほかの OS の常駐を使うと覚えた保管庫は、鍵を見ず、その常駐の保管庫の server.json で、答えれば立っているとみなす
func TestRunningUsesTheOtherOSsResident(t *testing.T) {
	h := openTestHome(t, t.TempDir())
	f := newFakeResident(t, nil)
	if err := h.WriteUse(home.Use{OS: home.UseWSL, Distro: "Ubuntu", Vault: otherVault(t, f, "")}); err != nil {
		t.Fatal(err)
	}
	if s, err := running(h); err != nil || s == nil || s.URL != f.ts.URL+"/" {
		t.Fatalf("running: %v, %v", s, err)
	}
	if residentDir(h) == h.Dir {
		t.Error("residentDir is the vault of this OS")
	}
	if err := h.WriteUse(home.Use{OS: home.UseWSL, Distro: "Ubuntu", Vault: otherVault(t, nil, "")}); err != nil {
		t.Fatal(err)
	}
	if s, err := running(h); err != nil || s != nil {
		t.Fatalf("no server.json: %v, %v", s, err)
	}
}

// 立っていなければ、ensure はこの OS に立てず、その OS の matomezu start を動かして、答えるまで待つ
func TestEnsureStartsTheOtherOSsResident(t *testing.T) {
	h := openTestHome(t, t.TempDir())
	f := newFakeResident(t, nil)
	vault := otherVault(t, nil, "")
	if err := h.WriteUse(home.Use{OS: home.UseWSL, Distro: "Ubuntu", Vault: vault}); err != nil {
		t.Fatal(err)
	}
	var ran []string
	old := sideOutput
	sideOutput = func(dir, name string, args ...string) ([]byte, error) {
		ran = append([]string{name}, args...)
		return nil, openTestHome(t, vault).WriteServer(home.Server{URL: f.ts.URL + "/", Token: "t"})
	}
	t.Cleanup(func() { sideOutput = old })
	s, err := ensure(h, serverFlags{})
	if err != nil || s == nil {
		t.Fatalf("ensure: %v, %v", s, err)
	}
	want := []string{"wsl.exe", "-d", "Ubuntu", "--cd", "~", "--", "bash", "-lc", "matomezu start"}
	if !slices.Equal(ran, want) {
		t.Errorf("ran %q, want %q", ran, want)
	}
}

// stop は、ほかの OS の常駐を、答えなくなるまで待って止める
func TestStopServerStopsTheOtherOSsResident(t *testing.T) {
	h := openTestHome(t, t.TempDir())
	f := newFakeResident(t, nil)
	if err := h.WriteUse(home.Use{OS: home.UseWindows, Vault: otherVault(t, f, "")}); err != nil {
		t.Fatal(err)
	}
	s, err := running(h)
	if err != nil || s == nil {
		t.Fatalf("running: %v, %v", s, err)
	}
	if err := stopServer(h, s); err != nil {
		t.Fatal(err)
	}
	if !f.wasStopped() {
		t.Error("not stopped")
	}
}

// 覚えるときは、先にこの OS の常駐を止めてから覚える（覚えたあとでは、止める先がほかの OS の常駐になる）
func TestUseOtherStopsThisOSsResidentFirst(t *testing.T) {
	dir := t.TempDir()
	t.Setenv(home.EnvHome, dir)
	h := openTestHome(t, dir)
	lock, err := h.Lock()
	if err != nil {
		t.Fatal(err)
	}
	local := newFakeResident(t, func() { lock.Unlock() })
	if err := h.WriteServer(home.Server{URL: local.ts.URL + "/", Token: "t"}); err != nil {
		t.Fatal(err)
	}
	other := newFakeResident(t, nil)
	u := home.Use{OS: home.UseWSL, Distro: "Ubuntu", Vault: otherVault(t, other, "")}
	if err := useOther(u, hereInfo{Vault: "/home/me/.matomezu"}); err != nil {
		t.Fatal(err)
	}
	if !local.wasStopped() || other.wasStopped() {
		t.Errorf("stopped: this OS %v, the other OS %v", local.wasStopped(), other.wasStopped())
	}
	if got, err := h.ReadUse(); err != nil || got == nil || *got != u {
		t.Errorf("use: %v, %v", got, err)
	}
	if err := (useLocalCmd{}).Run(); err != nil {
		t.Fatal(err)
	}
	if got, err := h.ReadUse(); err != nil || got != nil {
		t.Errorf("after use local: %v, %v", got, err)
	}
}

// この OS で常駐を立てる serve は、ほかの OS の常駐を使う保管庫では断る
func TestServeRefusesWhileUsingTheOtherOS(t *testing.T) {
	dir := t.TempDir()
	t.Setenv(home.EnvHome, dir)
	if err := openTestHome(t, dir).WriteUse(home.Use{OS: home.UseWSL, Distro: "Ubuntu", Vault: t.TempDir()}); err != nil {
		t.Fatal(err)
	}
	if err := (&serveCmd{}).Run(); err == nil || !strings.Contains(err.Error(), "matomezu use local") {
		t.Fatalf("serve: %v", err)
	}
}

// ほかの OS の matomezu の答えは、ログインのシェルが先に書いた行があっても、最後の行
func TestAskHereReadsTheLastLine(t *testing.T) {
	old := sideOutput
	sideOutput = func(dir, name string, args ...string) ([]byte, error) {
		if name != "cmd.exe" || dir != "/mnt/c" || !slices.Equal(args, []string{"/c", "matomezu use here"}) {
			t.Errorf("ran %s %q in %s", name, args, dir)
		}
		return []byte("welcome\n{\"vault\":\"C:\\\\Users\\\\me\\\\.matomezu\",\"version\":\"1.2.3\"}\r\n"), nil
	}
	t.Cleanup(func() { sideOutput = old })
	in, err := askHere(home.Use{OS: home.UseWindows})
	if err != nil || in.Vault != `C:\Users\me\.matomezu` || in.Version != "1.2.3" {
		t.Fatalf("%+v, %v", in, err)
	}
}

func TestWSLVaultFromWindows(t *testing.T) {
	if got := wslVaultFromWindows("Ubuntu-24.04", "/home/me/.matomezu"); got != `\\wsl.localhost\Ubuntu-24.04\home\me\.matomezu` {
		t.Error(got)
	}
}

// 版が違えば知らせる（同じ・開発の版・分からないなら知らせない）
func TestVersionNote(t *testing.T) {
	u := home.Use{OS: home.UseWSL, Distro: "Ubuntu"}
	here := installedVersion()
	for _, other := range []string{"", here, devVersion} {
		if note := versionNote(u, other); note != "" {
			t.Errorf("%q: %s", other, note)
		}
	}
	if here == devVersion {
		return
	}
	if note := versionNote(u, "0.0.1"); !strings.Contains(note, "WSL (Ubuntu)") {
		t.Error(note)
	}
}
