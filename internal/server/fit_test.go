package server

import (
	"bufio"
	"encoding/json"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// 紙に収まるかはカレントの画面に頼む。画面が無ければ 409。画面は預けた中身を取りに来て、はみ出す箱を答える（D33。fit.go）
func TestFitAsksTheCurrentScreen(t *testing.T) {
	_, ts, _ := setupHub(t)
	path := filepath.Join(t.TempDir(), "a.json")
	if err := os.WriteFile(path, []byte(`{"nodes":[{"id":1}]}`), 0o644); err != nil {
		t.Fatal(err)
	}
	token := map[string]string{"X-Matomezu-Token": "secret"}
	proposed := `{"nodes":[{"id":1,"caption":"大きい"}]}`
	body, _ := json.Marshal(map[string]any{"path": path, "data": json.RawMessage(proposed)})
	ask := func() (int, string) {
		res := do(t, "POST", ts.URL+"/api/fit", string(body), token)
		defer res.Body.Close()
		b, _ := io.ReadAll(res.Body)
		return res.StatusCode, string(b)
	}
	if s, msg := ask(); s != http.StatusConflict || !strings.Contains(msg, "not open in a browser") {
		t.Fatalf("no screen: %d %s", s, msg)
	}
	res := do(t, "GET", ts.URL+"/api/events", "", nil)
	defer res.Body.Close()
	r := bufio.NewReader(res.Body)
	nextEvent(t, r, "hello")
	go func() {
		var q struct{ Req, Doc string }
		json.Unmarshal([]byte(nextEvent(t, r, "fit")), &q)
		got := do(t, "GET", ts.URL+"/api/fit/"+q.Req, "", nil)
		b, _ := io.ReadAll(got.Body)
		got.Body.Close()
		if string(b) != proposed { // 預けた中身をそのまま取れる
			do(t, "POST", ts.URL+"/api/fit/"+q.Req, `{"error":"wrong data"}`, nil).Body.Close()
			return
		}
		do(t, "POST", ts.URL+"/api/fit/"+q.Req, `{"over":[{"page":"","paper":"a4-landscape 1123x794","boxes":[{"id":"1","caption":"大きい","right":40,"bottom":0}]}]}`, nil).Body.Close()
	}()
	s, msg := ask()
	if s != http.StatusOK {
		t.Fatalf("answer: %d %s", s, msg)
	}
	var out struct{ Over []FitOver }
	json.Unmarshal([]byte(msg), &out)
	if len(out.Over) != 1 || out.Over[0].Boxes[0].Right != 40 || out.Over[0].Paper != "a4-landscape 1123x794" {
		t.Fatalf("over: %+v", out)
	}
	go func() {
		var q struct{ Req string }
		json.Unmarshal([]byte(nextEvent(t, r, "fit")), &q)
		do(t, "POST", ts.URL+"/api/fit/"+q.Req, `{"busy":true}`, nil).Body.Close()
	}()
	if s, msg := ask(); s != http.StatusConflict || !strings.Contains(msg, "operating") {
		t.Fatalf("busy: %d %s", s, msg)
	}
}
