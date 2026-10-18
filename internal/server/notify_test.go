package server

import (
	"bufio"
	"encoding/json"
	"net/http"
	"os"
	"path/filepath"
	"testing"
	"time"
)

// 通知はカレントの画面にだけ送る。題名が無ければ断り、画面が無ければ 409。ファイルがあれば開く動き（book）を持つ（D30。notify.go）
func TestNotifyGoesToTheCurrentScreen(t *testing.T) {
	_, ts, _ := setupHub(t)
	token := map[string]string{"X-Matomezu-Token": "secret"}
	notify := func(body string) int {
		res := do(t, "POST", ts.URL+"/api/notify", body, token)
		res.Body.Close()
		return res.StatusCode
	}
	if s := notify(`{"title":"x"}`); s != http.StatusConflict {
		t.Fatalf("no screen: %d", s)
	}
	join := func() (string, *bufio.Reader) {
		res := do(t, "GET", ts.URL+"/api/events", "", nil)
		t.Cleanup(func() { res.Body.Close() })
		r := bufio.NewReader(res.Body)
		var hello struct{ Client string }
		json.Unmarshal([]byte(nextEvent(t, r, "hello")), &hello)
		return hello.Client, r
	}
	a, ra := join()
	_, rb := join()
	do(t, "POST", ts.URL+"/api/focus", `{"client":"`+a+`"}`, nil).Body.Close()
	if s := notify(`{"body":"no title"}`); s != http.StatusBadRequest {
		t.Fatalf("no title: %d", s)
	}
	path := filepath.Join(t.TempDir(), "a.json")
	if err := os.WriteFile(path, []byte(`{"nodes":[{"id":1}]}`), 0o644); err != nil {
		t.Fatal(err)
	}
	body, _ := json.Marshal(map[string]any{"title": "done", "body": "changed 1", "path": path, "page": "p2"})
	screen := screenEvent(ts.URL, ra, "notify")
	if s := notify(string(body)); s != http.StatusNoContent {
		t.Fatalf("notify: %d", s)
	}
	var n struct{ Title, Body, Book, Page, Dialog string }
	json.Unmarshal([]byte(<-screen), &n)
	if n.Title != "done" || n.Body != "changed 1" || n.Book != docID(path) || n.Page != "p2" || n.Dialog != "true" {
		t.Fatalf("notice: %+v", n)
	}
	// b には届かない（b に次に届くのは、このあとの mail だけの通知でもない。a にだけ送るので、b は何も読めずに時間切れ）
	got := make(chan string, 1)
	go func() { got <- readEventName(rb) }()
	select {
	case name := <-got:
		if name == "notify" {
			t.Fatal("the other screen got the notice")
		}
	case <-time.After(200 * time.Millisecond):
	}
	if s := notify(`{"title":"later","mail":true}`); s != http.StatusNoContent {
		t.Fatalf("mail only: %d", s)
	}
	var m struct{ Title, Dialog string }
	json.Unmarshal([]byte(nextEvent(t, ra, "notify")), &m)
	if m.Title != "later" || m.Dialog != "" {
		t.Fatalf("mail only: %+v", m)
	}
}

// readEventName は次のイベントの名前を返す（コメントや版の知らせも 1 つと数える）
func readEventName(r *bufio.Reader) string {
	for {
		line, err := r.ReadString('\n')
		if err != nil {
			return ""
		}
		if len(line) > 7 && line[:7] == "event: " {
			name := line[7 : len(line)-1]
			if name != "version" {
				return name
			}
		}
	}
}
