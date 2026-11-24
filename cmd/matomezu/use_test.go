package main

import (
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"regexp"
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

// counterpartVault は、相手の常駐の保管庫の代わり（server.json に version の常駐 f のつなぎ方を書く。f が nil なら書かない）
func counterpartVault(t *testing.T, f *fakeResident, version string) string {
	t.Helper()
	dir := t.TempDir()
	if f != nil {
		if err := openTestHome(t, dir).WriteServer(home.Server{URL: f.ts.URL + "/", Token: "t", Version: version}); err != nil {
			t.Fatal(err)
		}
	}
	return dir
}

// 相手の常駐を使うと覚えた保管庫は、鍵を見ず、その常駐の保管庫の server.json で、答えれば立っているとみなす
func TestRunningUsesTheCounterpart(t *testing.T) {
	h := openTestHome(t, t.TempDir())
	f := newFakeResident(t, nil)
	if err := h.WriteCounterpart(home.Counterpart{OS: home.CounterpartWSL, Distro: "Ubuntu", Vault: counterpartVault(t, f, "")}); err != nil {
		t.Fatal(err)
	}
	if s, err := running(h); err != nil || s == nil || s.URL != f.ts.URL+"/" {
		t.Fatalf("running: %v, %v", s, err)
	}
	if residentDir(h) == h.Dir {
		t.Error("residentDir is the vault of this OS")
	}
	if err := h.WriteCounterpart(home.Counterpart{OS: home.CounterpartWSL, Distro: "Ubuntu", Vault: counterpartVault(t, nil, "")}); err != nil {
		t.Fatal(err)
	}
	if s, err := running(h); err != nil || s != nil {
		t.Fatalf("no server.json: %v, %v", s, err)
	}
}

// 立っていなければ、ensure はこの OS に立てず、相手の OS の matomezu start を動かして、答えるまで待つ
func TestEnsureStartsTheCounterpart(t *testing.T) {
	h := openTestHome(t, t.TempDir())
	f := newFakeResident(t, nil)
	vault := counterpartVault(t, nil, "")
	if err := h.WriteCounterpart(home.Counterpart{OS: home.CounterpartWSL, Distro: "Ubuntu", Vault: vault}); err != nil {
		t.Fatal(err)
	}
	var ran []string
	old := commandOutput
	commandOutput = func(dir, name string, args ...string) ([]byte, error) {
		ran = append([]string{name}, args...)
		return nil, openTestHome(t, vault).WriteServer(home.Server{URL: f.ts.URL + "/", Token: "t"})
	}
	t.Cleanup(func() { commandOutput = old })
	s, err := ensure(h, serverFlags{})
	if err != nil || s == nil {
		t.Fatalf("ensure: %v, %v", s, err)
	}
	want := []string{"wsl.exe", "-d", "Ubuntu", "--cd", "~", "--", "bash", "-lic", "matomezu start"}
	if !slices.Equal(ran, want) {
		t.Errorf("ran %q, want %q", ran, want)
	}
}

// stop は、相手の常駐を、答えなくなるまで待って止める
func TestStopServerStopsTheCounterpart(t *testing.T) {
	h := openTestHome(t, t.TempDir())
	f := newFakeResident(t, nil)
	if err := h.WriteCounterpart(home.Counterpart{OS: home.CounterpartWindows, Vault: counterpartVault(t, f, "")}); err != nil {
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

// 覚えるときは、先にこの OS の常駐を止めてから覚える（覚えたあとでは、止める先が相手の常駐になる）
func TestUseCounterpartStopsThisOSsResidentFirst(t *testing.T) {
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
	u := home.Counterpart{OS: home.CounterpartWSL, Distro: "Ubuntu", Vault: counterpartVault(t, other, "")}
	if err := useCounterpart(u, hereInfo{Vault: "/home/me/.matomezu"}); err != nil {
		t.Fatal(err)
	}
	if !local.wasStopped() || other.wasStopped() {
		t.Errorf("stopped: this OS %v, the other OS %v", local.wasStopped(), other.wasStopped())
	}
	if got, err := h.ReadCounterpart(); err != nil || got == nil || *got != u {
		t.Errorf("use: %v, %v", got, err)
	}
	if err := (useLocalCmd{}).Run(); err != nil {
		t.Fatal(err)
	}
	if got, err := h.ReadCounterpart(); err != nil || got != nil {
		t.Errorf("after use local: %v, %v", got, err)
	}
}

// この OS で常駐を立てる serve は、相手の常駐を使う保管庫では断る
func TestServeRefusesWhileUsingTheCounterpart(t *testing.T) {
	dir := t.TempDir()
	t.Setenv(home.EnvHome, dir)
	if err := openTestHome(t, dir).WriteCounterpart(home.Counterpart{OS: home.CounterpartWSL, Distro: "Ubuntu", Vault: t.TempDir()}); err != nil {
		t.Fatal(err)
	}
	if err := (&serveCmd{}).Run(); err == nil || !strings.Contains(err.Error(), "matomezu use local") {
		t.Fatalf("serve: %v", err)
	}
}

// 相手の OS の matomezu の答えは、ログインのシェルが先に書いた行があっても、最後の行
func TestAskCounterpartReadsTheLastLine(t *testing.T) {
	old := commandOutput
	commandOutput = func(dir, name string, args ...string) ([]byte, error) {
		if name != "cmd.exe" || dir != "/mnt/c" || !slices.Equal(args, []string{"/c", "matomezu use here"}) {
			t.Errorf("ran %s %q in %s", name, args, dir)
		}
		return []byte("welcome\n{\"vault\":\"C:\\\\Users\\\\me\\\\.matomezu\",\"version\":\"1.2.3\"}\r\n"), nil
	}
	t.Cleanup(func() { commandOutput = old })
	in, err := askCounterpart(home.Counterpart{OS: home.CounterpartWindows})
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
	u := home.Counterpart{OS: home.CounterpartWSL, Distro: "Ubuntu"}
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

// 相手の保管庫もこちらの常駐を使うと覚えていれば、覚えずに断る（互いに相手の常駐を立てさせ合う）
func TestUseCounterpartRefusesWhenItUsesThisOS(t *testing.T) {
	dir := t.TempDir()
	t.Setenv(home.EnvHome, dir)
	err := useCounterpart(home.Counterpart{OS: home.CounterpartWSL, Distro: "Ubuntu", Vault: t.TempDir()}, hereInfo{Vault: "/home/me/.matomezu", Uses: true})
	if err == nil || !strings.Contains(err.Error(), "matomezu use local there") {
		t.Fatalf("useCounterpart: %v", err)
	}
	if u, err := openTestHome(t, dir).ReadCounterpart(); err != nil || u != nil {
		t.Errorf("use: %v, %v", u, err)
	}
}

// 相手の常駐を使う保管庫では、update の立て直しと plugin-remove の止めは、その常駐に触らず、相手の OS のコマンドも動かさない
func TestUpdateAndPluginRemoveLeaveTheCounterpart(t *testing.T) {
	dir := t.TempDir()
	t.Setenv(home.EnvHome, dir)
	f := newFakeResident(t, nil)
	if err := openTestHome(t, dir).WriteCounterpart(home.Counterpart{OS: home.CounterpartWSL, Distro: "Ubuntu", Vault: counterpartVault(t, f, "0.0.1")}); err != nil {
		t.Fatal(err)
	}
	old := commandOutput
	commandOutput = func(dir, name string, args ...string) ([]byte, error) {
		t.Errorf("ran %s %q", name, args)
		return nil, nil
	}
	t.Cleanup(func() { commandOutput = old })
	if err := restartOlderServer(); err != nil {
		t.Fatal(err)
	}
	if err := stopHere(); err != nil {
		t.Fatal(err)
	}
	if f.wasStopped() {
		t.Error("the server of the other OS was stopped")
	}
}

// 相手の OS の matomezu を動かすコマンド: WSL は distro のホームのフォルダの対話のログインのシェル、Windows は C: の cmd.exe
func TestSideCommand(t *testing.T) {
	for _, c := range []struct {
		u    home.Counterpart
		name string
		args []string
		dir  string
	}{
		{home.Counterpart{OS: home.CounterpartWSL, Distro: "Ubuntu"}, "wsl.exe", []string{"-d", "Ubuntu", "--cd", "~", "--", "bash", "-lic", "matomezu use here"}, ""},
		{home.Counterpart{OS: home.CounterpartWSL}, "wsl.exe", []string{"--cd", "~", "--", "bash", "-lic", "matomezu use here"}, ""},
		{home.Counterpart{OS: home.CounterpartWindows}, "cmd.exe", []string{"/c", "matomezu use here"}, "/mnt/c"},
	} {
		name, args, dir := counterpartCommand(c.u, "use", "here")
		if name != c.name || !slices.Equal(args, c.args) || dir != c.dir {
			t.Errorf("%+v: %s %q in %q", c.u, name, args, dir)
		}
	}
}

// WSL が NAT モードなら、Windows の常駐に届かないので、use windows は断る
func TestCounterpartWindowsRefusesNATNetworking(t *testing.T) {
	if !onWSL() {
		t.Skip("only on WSL")
	}
	dir := t.TempDir()
	t.Setenv(home.EnvHome, dir)
	old := commandOutput
	commandOutput = func(dir, name string, args ...string) ([]byte, error) {
		if name != "wslinfo" {
			t.Errorf("ran %s %q", name, args)
		}
		return []byte("nat\n"), nil
	}
	t.Cleanup(func() { commandOutput = old })
	if err := (useWindowsCmd{}).Run(); err == nil || !strings.Contains(err.Error(), "networkingMode=mirrored") {
		t.Fatalf("use windows: %v", err)
	}
}

// 常駐を探す・止めるコードは running・ensure・stopServer を通す（WSL と Windows の相手の常駐を使う保管庫で、相手を見落とさない）。
// 保管庫の鍵や server.json を直に見てよいのは、それらを書く serve.go と use.go だけ
func TestOnlyServeAndUseLookAtTheVaultsServerDirectly(t *testing.T) {
	files, err := filepath.Glob("*.go")
	if err != nil {
		t.Fatal(err)
	}
	direct := regexp.MustCompile(`localRunning\(|stopLocal\(|\.Running\(\)|\.ReadServer\(\)`)
	for _, f := range files {
		if strings.HasSuffix(f, "_test.go") || f == "serve.go" || f == "use.go" {
			continue
		}
		b, err := os.ReadFile(f)
		if err != nil {
			t.Fatal(err)
		}
		if loc := direct.FindIndex(b); loc != nil {
			t.Errorf("%s: %s looks at the vault's server directly: use running, ensure or stopServer", f, b[loc[0]:loc[1]])
		}
	}
}
