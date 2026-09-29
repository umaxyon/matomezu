package server

import (
	"bufio"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
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
