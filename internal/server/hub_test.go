package server

import (
	"bufio"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"testing/fstest"
	"time"
)

func setupHub(t *testing.T) (*Hub, *httptest.Server, chan struct{}) {
	t.Helper()
	ctx, cancel := context.WithCancel(context.Background())
	t.Cleanup(cancel)
	web := fstest.MapFS{
		"index.html":       {Data: []byte("<html>")},
		"dist/matomezu.js": {Data: []byte("js")},
	}
	stopped := make(chan struct{}, 1)
	hub := NewHub(ctx, web, WithInterval(20*time.Millisecond),
		WithControl("secret", "v1", func() { stopped <- struct{}{} }))
	ts := httptest.NewServer(hub.Handler())
	t.Cleanup(ts.Close)
	return hub, ts, stopped
}

func openVia(t *testing.T, ts *httptest.Server, token, path string) (*http.Response, OpenResult) {
	t.Helper()
	body, _ := json.Marshal(map[string]string{"path": path})
	res := do(t, "POST", ts.URL+"/api/open", string(body), map[string]string{"X-Matomezu-Token": token})
	var out OpenResult
	if res.StatusCode == http.StatusOK {
		json.NewDecoder(res.Body).Decode(&out)
	}
	return res, out
}

func TestControlRequiresToken(t *testing.T) {
	_, ts, _ := setupHub(t)
	path := filepath.Join(t.TempDir(), "a.json")
	for _, token := range []string{"", "wrong"} {
		if res, _ := openVia(t, ts, token, path); res.StatusCode != http.StatusForbidden {
			t.Fatalf("token %q: status = %d", token, res.StatusCode)
		}
	}
	if res := do(t, "GET", ts.URL+"/api/ping", "", nil); res.StatusCode != http.StatusForbidden {
		t.Fatalf("ping without token: %d", res.StatusCode)
	}
	res := do(t, "GET", ts.URL+"/api/ping", "", map[string]string{"X-Matomezu-Token": "secret"})
	b, _ := io.ReadAll(res.Body)
	if !strings.Contains(string(b), `"version":"v1"`) {
		t.Fatalf("ping = %s", b)
	}
}

func TestOpenIsStablePerFile(t *testing.T) {
	_, ts, _ := setupHub(t)
	dir := t.TempDir()
	_, a1 := openVia(t, ts, "secret", filepath.Join(dir, "a.json"))
	_, a2 := openVia(t, ts, "secret", filepath.Join(dir, ".", "a.json"))
	_, b := openVia(t, ts, "secret", filepath.Join(dir, "b.json"))
	if a1.ID == "" || a1.ID != a2.ID || a1.ID == b.ID {
		t.Fatalf("ids: %s %s %s", a1.ID, a2.ID, b.ID)
	}
	// 画面と dist は1つ、API は図ごと
	for _, p := range []string{"/", "/dist/matomezu.js", "/api/info", "/d/" + b.ID + "/api/data"} {
		if res := do(t, "GET", ts.URL+p, "", nil); res.StatusCode != http.StatusOK {
			t.Fatalf("GET %s: %d", p, res.StatusCode)
		}
	}
	if res := do(t, "GET", ts.URL+"/d/unknown/api/data", "", nil); res.StatusCode != http.StatusNotFound {
		t.Fatalf("unknown id: %d", res.StatusCode)
	}
}

func TestOldURLRedirectsToApp(t *testing.T) {
	_, ts, _ := setupHub(t)
	_, a := openVia(t, ts, "secret", filepath.Join(t.TempDir(), "a.json"))
	c := &http.Client{CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}
	for _, p := range []string{"/d/" + a.ID, "/d/" + a.ID + "/"} {
		res, err := c.Get(ts.URL + p)
		if err != nil {
			t.Fatal(err)
		}
		res.Body.Close()
		if loc := res.Header.Get("Location"); loc != "/?d="+a.ID {
			t.Fatalf("%s: location = %q", p, loc)
		}
	}
}

// open の show は、つながっている画面と、少しあとにつながった画面に届く
func TestShowIsSentAndReplayed(t *testing.T) {
	_, ts, _ := setupHub(t)
	res := do(t, "GET", ts.URL+"/api/events", "", nil)
	r := bufio.NewReader(res.Body)
	if v := nextEvent(t, r, "server"); v != `"v1"` {
		t.Fatalf("server = %s", v)
	}
	body, _ := json.Marshal(map[string]any{"path": filepath.Join(t.TempDir(), "a.json"), "show": true})
	var a OpenResult
	json.NewDecoder(do(t, "POST", ts.URL+"/api/open", string(body), map[string]string{"X-Matomezu-Token": "secret"}).Body).Decode(&a)
	if a.Connections != 1 {
		t.Fatalf("connections = %d", a.Connections)
	}
	want := `{"doc":"` + a.ID + `","page":""}`
	if v := nextEvent(t, r, "open"); v != want {
		t.Fatalf("open = %s", v)
	}
	late := bufio.NewReader(do(t, "GET", ts.URL+"/api/events", "", nil).Body)
	if v := nextEvent(t, late, "open"); v != want {
		t.Fatalf("replayed open = %s", v)
	}
}

func TestConnectionsAndIdle(t *testing.T) {
	hub, ts, _ := setupHub(t)
	path := filepath.Join(t.TempDir(), "a.json")
	_, a := openVia(t, ts, "secret", path)
	if a.Connections != 0 || hub.Idle() == 0 {
		t.Fatalf("before: conns=%d idle=%v", a.Connections, hub.Idle())
	}

	ctx, cancel := context.WithCancel(context.Background())
	req, _ := http.NewRequestWithContext(ctx, "GET", ts.URL+"/api/events", nil)
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	bufio.NewReader(res.Body).ReadString('\n') // 接続が登録されるまで待つ

	// 画面がつながっていれば、open はそれを知らせる（ブラウザを開き直さないため）
	if _, again := openVia(t, ts, "secret", path); again.Connections != 1 {
		t.Fatalf("connections = %d", again.Connections)
	}
	if hub.Idle() != 0 {
		t.Fatalf("idle while connected: %v", hub.Idle())
	}

	cancel()
	res.Body.Close()
	deadline := time.Now().Add(2 * time.Second)
	for hub.Idle() == 0 {
		if time.Now().After(deadline) {
			t.Fatal("still connected")
		}
		time.Sleep(10 * time.Millisecond)
	}
}

func TestShutdown(t *testing.T) {
	_, ts, stopped := setupHub(t)
	res := do(t, "POST", ts.URL+"/api/shutdown", "", map[string]string{"X-Matomezu-Token": "secret"})
	if res.StatusCode != http.StatusNoContent {
		t.Fatalf("status = %d", res.StatusCode)
	}
	select {
	case <-stopped:
	case <-time.After(time.Second):
		t.Fatal("shutdown not called")
	}
}

// 監視するのは、画面が開いている図（/api/watch で知らせたもの）だけ
func TestWatchesOnlyOpenDocs(t *testing.T) {
	_, ts, _ := setupHub(t)
	dir := t.TempDir()
	pa, pb := filepath.Join(dir, "a.json"), filepath.Join(dir, "b.json")
	_, a := openVia(t, ts, "secret", pa)
	_, b := openVia(t, ts, "secret", pb)
	r := bufio.NewReader(do(t, "GET", ts.URL+"/api/events", "", nil).Body)
	var hello struct{ Client string }
	json.Unmarshal([]byte(nextEvent(t, r, "hello")), &hello)
	nextEvent(t, r, "version") // つないだ時点の a と b の版
	nextEvent(t, r, "version")
	if res := do(t, "POST", ts.URL+"/api/watch", `{"client":"`+hello.Client+`","docs":["`+a.ID+`"]}`, nil); res.StatusCode != http.StatusNoContent {
		t.Fatalf("watch: %d", res.StatusCode)
	}
	// 開いていない b を書き換えても知らせない。開いている a は知らせる（b の知らせが来るなら a より先に来る）
	if err := os.WriteFile(pb, []byte(`{"nodes":[{"id":1}]}`), 0o644); err != nil {
		t.Fatal(err)
	}
	time.Sleep(150 * time.Millisecond)
	if err := os.WriteFile(pa, []byte(`{"nodes":[{"id":2}]}`), 0o644); err != nil {
		t.Fatal(err)
	}
	var v struct{ Doc string }
	json.Unmarshal([]byte(nextEvent(t, r, "version")), &v)
	if v.Doc != a.ID {
		t.Fatalf("version for %s (a=%s, b=%s)", v.Doc, a.ID, b.ID)
	}
	if res := do(t, "POST", ts.URL+"/api/watch", `{"client":"nobody","docs":[]}`, nil); res.StatusCode != http.StatusNotFound {
		t.Fatalf("unknown client: %d", res.StatusCode)
	}
}

// 登録済みの図を開き直しても読み直さない。ファイルが消えていれば空の図で作り直す
func TestReopenRecreatesMissingFile(t *testing.T) {
	_, ts, _ := setupHub(t)
	path := filepath.Join(t.TempDir(), "a.json")
	openVia(t, ts, "secret", path)
	if err := os.Remove(path); err != nil {
		t.Fatal(err)
	}
	if res, _ := openVia(t, ts, "secret", path); res.StatusCode != http.StatusOK {
		t.Fatalf("reopen: %d", res.StatusCode)
	}
	if b, err := os.ReadFile(path); err != nil || string(b) != emptyDiagram {
		t.Fatalf("file = %q, %v", b, err)
	}
}

// 登録した図は store に書き、次に起動した Hub が登録し直す。ファイルが消えた図は登録しない（空の図も作らない）
func TestStoreRestoresDocs(t *testing.T) {
	dir := t.TempDir()
	store := filepath.Join(dir, "state", "docs.json")
	a, b := filepath.Join(dir, "a.json"), filepath.Join(dir, "b.json")
	for _, p := range []string{a, b} {
		if err := os.WriteFile(p, []byte(`{"nodes":[]}`), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	web := fstest.MapFS{"index.html": {Data: []byte("<html>")}}
	ctx, cancel := context.WithCancel(context.Background())
	first := NewHub(ctx, web, WithStore(store))
	for _, p := range []string{a, b, a} { // 開き直すと一番新しいものになる
		if _, err := first.Open(p, false, ""); err != nil {
			t.Fatal(err)
		}
	}
	cancel()
	var saved []string
	raw, _ := os.ReadFile(store)
	json.Unmarshal(raw, &saved)
	if len(saved) != 2 || saved[0] != b || saved[1] != a {
		t.Fatalf("store = %v", saved)
	}

	os.Remove(b)
	ctx2, cancel2 := context.WithCancel(context.Background())
	t.Cleanup(cancel2)
	second := NewHub(ctx2, web, WithStore(store))
	if second.docs[docID(a)] == nil {
		t.Fatal("a が登録し直されていない")
	}
	if second.docs[docID(b)] != nil {
		t.Fatal("消えた b を登録した")
	}
	if _, err := os.Stat(b); err == nil {
		t.Fatal("消えた b を空の図で作った")
	}
}
