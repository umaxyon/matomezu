package server

import (
	"encoding/json"
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

// 配置の要約はページごとに覚える
func TestLayoutPerPage(t *testing.T) {
	base, _ := setup(t, `{"nodes":[]}`)
	v := strings.Trim(do(t, "GET", base+"/api/data", "", nil).Header.Get("ETag"), `"`)
	for _, l := range []string{`{"version":"` + v + `","page":"","summary":"first"}`, `{"version":"` + v + `","page":"3","summary":"third"}`} {
		if res := do(t, "POST", base+"/api/layout", l, nil); res.StatusCode != http.StatusNoContent {
			t.Fatalf("post: %d", res.StatusCode)
		}
	}
	for page, want := range map[string]string{"": "first", "3": "third", "9": ""} {
		var got struct{ Version, Page, Summary, Current string }
		json.NewDecoder(do(t, "GET", base+"/api/layout?page="+page, "", nil).Body).Decode(&got)
		if got.Summary != want || got.Page != page || got.Current != v {
			t.Fatalf("page %q: %+v", page, got)
		}
	}
}
