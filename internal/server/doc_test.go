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
	"sync"
	"testing"
	"testing/fstest"
	"time"
)

// 図を1つ登録した Hub を立て、その図の URL（/d/<id>）とファイルのパスを返す
func setup(t *testing.T, content string) (string, string) {
	t.Helper()
	path := filepath.Join(t.TempDir(), "d.json")
	if content != "" {
		if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	ctx, cancel := context.WithCancel(context.Background())
	t.Cleanup(cancel)
	web := fstest.MapFS{"index.html": {Data: []byte("<html>")}}
	hub := NewHub(ctx, web, WithInterval(20*time.Millisecond))
	res, err := hub.Open(path, false, "")
	if err != nil {
		t.Fatal(err)
	}
	ts := httptest.NewServer(hub.Handler())
	t.Cleanup(ts.Close)
	return ts.URL + "/d/" + res.ID, path
}

func do(t *testing.T, method, url, body string, header map[string]string) *http.Response {
	t.Helper()
	req, _ := http.NewRequest(method, url, strings.NewReader(body))
	if body != "" {
		req.Header.Set("Content-Type", "application/json") // 画面と同じ（書き込みは JSON の本文だけを受ける。fromPage）
	}
	for k, v := range header {
		if k == "Host" {
			req.Host = v // Host はヘッダーに入れても無視される
			continue
		}
		req.Header.Set(k, v)
	}
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { res.Body.Close() })
	return res
}

func TestCreatesMissingFile(t *testing.T) {
	base, path := setup(t, "")
	b, err := os.ReadFile(path)
	if err != nil || string(b) != emptyDiagram {
		t.Fatalf("file = %q, %v", b, err)
	}
	res := do(t, "GET", base+"/api/data", "", nil)
	body, _ := io.ReadAll(res.Body)
	if string(body) != emptyDiagram || res.Header.Get("ETag") == "" {
		t.Fatalf("GET = %q etag=%q", body, res.Header.Get("ETag"))
	}
}

func TestPutWithMatchingVersion(t *testing.T) {
	base, path := setup(t, `{"nodes":[]}`)
	etag := do(t, "GET", base+"/api/data", "", nil).Header.Get("ETag")

	res := do(t, "PUT", base+"/api/data", `{"nodes":[{"id":1}]}`, map[string]string{"If-Match": etag})
	if res.StatusCode != http.StatusNoContent {
		t.Fatalf("status = %d", res.StatusCode)
	}
	if b, _ := os.ReadFile(path); string(b) != `{"nodes":[{"id":1}]}` {
		t.Fatalf("file = %q", b)
	}
	if res.Header.Get("ETag") == etag {
		t.Fatal("etag not updated")
	}
}

func TestPutConflictKeepsExternalChange(t *testing.T) {
	base, path := setup(t, `{"nodes":[]}`)
	etag := do(t, "GET", base+"/api/data", "", nil).Header.Get("ETag")
	os.WriteFile(path, []byte(`{"nodes":[{"id":9}]}`), 0o644) // LLM が書き換えた

	res := do(t, "PUT", base+"/api/data", `{"nodes":[{"id":1}]}`, map[string]string{"If-Match": etag})
	if res.StatusCode != http.StatusConflict {
		t.Fatalf("status = %d", res.StatusCode)
	}
	if b, _ := os.ReadFile(path); string(b) != `{"nodes":[{"id":9}]}` {
		t.Fatalf("file overwritten: %q", b)
	}
}

func TestPutRejectsInvalidJSON(t *testing.T) {
	base, path := setup(t, `{"nodes":[]}`)
	res := do(t, "PUT", base+"/api/data", `{"nodes":`, nil)
	if res.StatusCode != http.StatusBadRequest {
		t.Fatalf("status = %d", res.StatusCode)
	}
	if b, _ := os.ReadFile(path); string(b) != `{"nodes":[]}` {
		t.Fatalf("file = %q", b)
	}
}

func TestRejectsForeignHost(t *testing.T) {
	base, _ := setup(t, `{"nodes":[]}`)
	res := do(t, "GET", base+"/api/data", "", map[string]string{"Host": "evil.example:80"})
	if res.StatusCode != http.StatusForbidden {
		t.Fatalf("status = %d", res.StatusCode)
	}
}

func TestServesWeb(t *testing.T) {
	base, _ := setup(t, `{"nodes":[]}`)
	res := do(t, "GET", base+"/", "", nil)
	body, _ := io.ReadAll(res.Body)
	if string(body) != "<html>" {
		t.Fatalf("body = %q", body)
	}
}

// SSE から name のイベントを1つ読み、data を返す（ほかのイベントは読み飛ばす）
func nextEvent(t *testing.T, r *bufio.Reader, name string) string {
	t.Helper()
	got := make(chan string, 1)
	go func() {
		ev := ""
		for {
			line, err := r.ReadString('\n')
			if err != nil {
				return
			}
			line = strings.TrimSpace(line)
			if v, ok := strings.CutPrefix(line, "event: "); ok {
				ev = v
			} else if v, ok := strings.CutPrefix(line, "data: "); ok && ev == name {
				got <- v
				return
			}
		}
	}()
	select {
	case v := <-got:
		return v
	case <-time.After(2 * time.Second):
		t.Fatalf("no %s event", name)
		return ""
	}
}

// SSE から version イベントを1つ読み、版を返す
func nextVersion(t *testing.T, r *bufio.Reader) string {
	t.Helper()
	var e struct{ Doc, Version string }
	if err := json.Unmarshal([]byte(nextEvent(t, r, "version")), &e); err != nil {
		t.Fatal(err)
	}
	return e.Version
}

// 図の URL（/d/<id>）から、サーバーの根の URL を取り出す
func rootOf(base string) string { return base[:strings.Index(base, "/d/")] }

func TestEventsOnExternalChangeOnly(t *testing.T) {
	base, path := setup(t, `{"nodes":[]}`)
	res := do(t, "GET", rootOf(base)+"/api/events", "", nil)
	r := bufio.NewReader(res.Body)
	first := nextVersion(t, r)
	if `"`+first+`"` != do(t, "GET", base+"/api/data", "", nil).Header.Get("ETag") {
		t.Fatal("first event is not the current version")
	}

	// 外部での変更は知らせる
	os.WriteFile(path, []byte(`{"nodes":[{"id":2}]}`), 0o644)
	ext := nextVersion(t, r)
	if ext == first {
		t.Fatal("version not changed")
	}

	// 画面からの保存も版が変わるので知らせる（画面は自分の版と同じなら無視する）
	put := do(t, "PUT", base+"/api/data", `{"nodes":[{"id":3}]}`, map[string]string{"If-Match": `"` + ext + `"`})
	if v := nextVersion(t, r); `"`+v+`"` != put.Header.Get("ETag") {
		t.Fatalf("event %s != put etag %s", v, put.Header.Get("ETag"))
	}
}

// 監視がファイルを読んでいる間に画面からの保存が入っても、監視が古い版で上書きして知らせない（版が戻ると、画面が
// 自分の保存を外部の変更と取り違えて読み直し、保存待ちの編集を捨てる）
func TestPollDoesNotRollBackAConcurrentSave(t *testing.T) {
	path := filepath.Join(t.TempDir(), "d.json")
	old, next := []byte(`{"nodes":[{"id":1}]}`), []byte(`{"nodes":[{"id":2}]}`)
	os.WriteFile(path, old, 0o644)
	var mu sync.Mutex
	var seen []string
	d := &doc{id: "x", path: path, version: hash(old),
		onVersion: func(_, v string) { mu.Lock(); seen = append(seen, v); mu.Unlock() }}
	done := make(chan struct{})
	readFile = func(p string) ([]byte, error) {
		b, err := os.ReadFile(p) // 古い中身を読んだところで、保存が入る
		go func() {
			d.putData(httptest.NewRecorder(), httptest.NewRequest("PUT", "/api/data", strings.NewReader(string(next))))
			close(done)
		}()
		time.Sleep(50 * time.Millisecond)
		return b, err
	}
	t.Cleanup(func() { readFile = os.ReadFile })
	d.poll()
	<-done
	if d.version != hash(next) {
		t.Fatalf("version rolled back to the old content")
	}
	mu.Lock()
	defer mu.Unlock()
	if len(seen) != 1 || seen[0] != hash(next) {
		t.Fatalf("notified versions: %v", seen)
	}
}

// 画面からの書き込みは、JSON の本文で Origin が無いか localhost のものだけ（ほかのサイトのページから送られたものを断る。fromPage）
func TestWritesOnlyFromPage(t *testing.T) {
	base, _ := setup(t, `{"nodes":[]}`)
	for name, h := range map[string]map[string]string{
		"text/plain":   {"Content-Type": "text/plain"},
		"other origin": {"Origin": "https://evil.example"},
	} {
		if res := do(t, "PUT", base+"/api/data", `{"nodes":[]}`, h); res.StatusCode != http.StatusForbidden {
			t.Errorf("data %s: %d", name, res.StatusCode)
		}
	}
	if res := do(t, "PUT", base+"/api/data", `{"nodes":[]}`, map[string]string{"Origin": "http://localhost:4000"}); res.StatusCode != http.StatusNoContent {
		t.Errorf("localhost origin: %d", res.StatusCode)
	}
}
