package server

import (
	"bufio"
	"encoding/json"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// 要約はカレントの画面に頼んで返す。画面が無ければ断り、操作中なら busy、答えの版が古ければ頼み直す（D30。summary.go）
func TestSummaryAsksTheCurrentScreen(t *testing.T) {
	_, ts, _ := setupHub(t)
	path := filepath.Join(t.TempDir(), "a.json")
	if err := os.WriteFile(path, []byte(`{"nodes":[{"id":1}]}`), 0o644); err != nil {
		t.Fatal(err)
	}
	token := map[string]string{"X-Matomezu-Token": "secret"}
	body, _ := json.Marshal(map[string]string{"path": path, "page": "p2"})
	ask := func() (int, string) {
		res := do(t, "POST", ts.URL+"/api/summary", string(body), token)
		defer res.Body.Close()
		var b strings.Builder
		bufio.NewReader(res.Body).WriteTo(&b)
		return res.StatusCode, b.String()
	}
	if s, msg := ask(); s != http.StatusConflict || !strings.Contains(msg, "not open in a browser") {
		t.Fatalf("no screen: %d %s", s, msg)
	}

	// 画面の代わり: 頼まれた要約に、answer の返す答えを送る
	res := do(t, "GET", ts.URL+"/api/events", "", nil)
	defer res.Body.Close()
	r := bufio.NewReader(res.Body)
	nextEvent(t, r, "hello")
	type request struct{ Req, Doc, Page, Version string }
	screen := func(answer func(q request) map[string]any) {
		go func() {
			for {
				var q request
				json.Unmarshal([]byte(nextEvent(t, r, "summary")), &q)
				a := answer(q)
				if a == nil {
					return
				}
				b, _ := json.Marshal(a)
				do(t, "POST", ts.URL+"/api/summary/"+q.Req, string(b), nil)
				if a["last"] == true {
					return
				}
			}
		}()
	}

	// 答えの版が今のファイルの版なら返す。頼みには page と今の版が付く
	asked := make(chan request, 4)
	screen(func(q request) map[string]any {
		asked <- q
		return map[string]any{"version": q.Version, "page": q.Page, "summary": "viewport 800x600 → fits", "last": true}
	})
	if s, msg := ask(); s != http.StatusOK || !strings.Contains(msg, "fits") {
		t.Fatalf("answer: %d %s", s, msg)
	}
	if q := <-asked; q.Page != "p2" || q.Version == "" {
		t.Fatalf("request: %+v", q)
	}

	// 古い版で答えたら頼み直す（set の直後で、画面がまだ読み直していない）
	n := 0
	screen(func(q request) map[string]any {
		n++
		if n == 1 {
			return map[string]any{"version": "old", "summary": "stale"}
		}
		return map[string]any{"version": q.Version, "summary": "fresh", "last": true}
	})
	if s, msg := ask(); s != http.StatusOK || !strings.Contains(msg, "fresh") || n != 2 {
		t.Fatalf("retry: %d %s (asked %d times)", s, msg, n)
	}

	// 操作中で並べられなければ busy
	screen(func(q request) map[string]any { return map[string]any{"busy": true, "last": true} })
	if s, msg := ask(); s != http.StatusConflict || !strings.Contains(msg, "operating") {
		t.Fatalf("busy: %d %s", s, msg)
	}
}
