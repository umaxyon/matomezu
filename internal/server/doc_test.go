package server

import (
	"bufio"
	"context"
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
	res, err := hub.Open(path)
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

// SSE から version イベントを1つ読む
func nextVersion(t *testing.T, r *bufio.Reader) string {
	t.Helper()
	got := make(chan string, 1)
	go func() {
		for {
			line, err := r.ReadString('\n')
			if err != nil {
				return
			}
			if v, ok := strings.CutPrefix(strings.TrimSpace(line), "data: "); ok {
				got <- v
				return
			}
		}
	}()
	select {
	case v := <-got:
		return v
	case <-time.After(2 * time.Second):
		t.Fatal("no event")
		return ""
	}
}

func TestEventsOnExternalChangeOnly(t *testing.T) {
	base, path := setup(t, `{"nodes":[]}`)
	res := do(t, "GET", base+"/api/events", "", nil)
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
