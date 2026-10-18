package server

import (
	"bufio"
	"encoding/json"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"testing"
)

// フォーカス枠はカレントの画面に頼み、画面の答えをそのまま返す。断り（busy・pending）は 409、箱が無いなどは 422（D37。point.go）
func TestPointAsksTheCurrentScreen(t *testing.T) {
	_, ts, _ := setupHub(t)
	token := map[string]string{"X-Matomezu-Token": "secret"}
	path := filepath.Join(t.TempDir(), "a.json")
	if err := os.WriteFile(path, []byte(`{"nodes":[{"id":1}]}`), 0o644); err != nil {
		t.Fatal(err)
	}
	body, _ := json.Marshal(map[string]any{"path": path, "box": "1"})
	point := func(b string) (int, string) {
		res := do(t, "POST", ts.URL+"/api/point", b, token)
		defer res.Body.Close()
		out, _ := io.ReadAll(res.Body)
		return res.StatusCode, string(out)
	}
	if s, _ := point(string(body)); s != http.StatusConflict {
		t.Fatalf("no screen: %d", s)
	}
	res := do(t, "GET", ts.URL+"/api/events", "", nil)
	t.Cleanup(func() { res.Body.Close() })
	r := bufio.NewReader(res.Body)
	var hello struct{ Client string }
	json.Unmarshal([]byte(nextEvent(t, r, "hello")), &hello)
	do(t, "POST", ts.URL+"/api/focus", `{"client":"`+hello.Client+`"}`, nil).Body.Close()

	// 画面の役: 頼みを読んで、決めた答えを返す
	answerWith := func(answer string) <-chan map[string]string {
		got := make(chan map[string]string, 1)
		go func() {
			var p map[string]string
			json.Unmarshal([]byte(<-screenEvent(ts.URL, r, "point")), &p)
			do(t, "POST", ts.URL+"/api/point/"+p["req"], answer, nil).Body.Close()
			got <- p
		}()
		return got
	}
	asked := answerWith(`{"state":"shown"}`)
	if s, out := point(string(body)); s != http.StatusOK || out == "" {
		t.Fatalf("shown: %d %s", s, out)
	}
	if p := <-asked; p["doc"] != docID(path) || p["box"] != "1" {
		t.Fatalf("request: %+v", p)
	}
	for answer, want := range map[string]int{
		`{"state":"pending"}`:                http.StatusConflict,
		`{"state":"busy"}`:                   http.StatusConflict,
		`{"state":"error","error":"no box"}`: http.StatusUnprocessableEntity,
	} {
		ch := answerWith(answer)
		if s, out := point(string(body)); s != want {
			t.Fatalf("%s: %d %s", answer, s, out)
		}
		<-ch
	}
	// -clear は図も箱も要らない
	ch := answerWith(`{"state":"cleared"}`)
	if s, _ := point(`{"clear":true}`); s != http.StatusOK {
		t.Fatalf("clear: %d", s)
	}
	if p := <-ch; p["clear"] != "true" || p["box"] != "" {
		t.Fatalf("clear request: %+v", p)
	}
}

// 郵便のフォーカス（matomezu focus -mail）は通知の box で送る。題名は無くてよいが、ファイルは要る
func TestNotifyWithBox(t *testing.T) {
	_, ts, _ := setupHub(t)
	token := map[string]string{"X-Matomezu-Token": "secret"}
	res := do(t, "GET", ts.URL+"/api/events", "", nil)
	t.Cleanup(func() { res.Body.Close() })
	r := bufio.NewReader(res.Body)
	var hello struct{ Client string }
	json.Unmarshal([]byte(nextEvent(t, r, "hello")), &hello)
	do(t, "POST", ts.URL+"/api/focus", `{"client":"`+hello.Client+`"}`, nil).Body.Close()
	notify := func(body string) int {
		res := do(t, "POST", ts.URL+"/api/notify", body, token)
		res.Body.Close()
		return res.StatusCode
	}
	if s := notify(`{"box":"1","mail":true}`); s != http.StatusBadRequest {
		t.Fatalf("box without a file: %d", s)
	}
	path := filepath.Join(t.TempDir(), "a.json")
	if err := os.WriteFile(path, []byte(`{"nodes":[{"id":1}]}`), 0o644); err != nil {
		t.Fatal(err)
	}
	body, _ := json.Marshal(map[string]any{"path": path, "box": "1", "mail": true})
	screen := screenEvent(ts.URL, r, "notify")
	if s := notify(string(body)); s != http.StatusNoContent {
		t.Fatalf("notify: %d", s)
	}
	var n struct{ Book, Box, Dialog string }
	json.Unmarshal([]byte(<-screen), &n)
	if n.Book != docID(path) || n.Box != "1" || n.Dialog != "" {
		t.Fatalf("notice: %+v", n)
	}
}
