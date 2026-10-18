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

// 紙に収まるかはカレントの画面に頼む。画面が無ければ 409。画面は預けた中身を取りに来て、収まらないページを答える（D33。fit.go）
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
		do(t, "POST", ts.URL+"/api/fit/"+q.Req, `{"over":[{"page":"","name":"最初のページ","paper":"a4-landscape 1123x794","axis":"x","short":40,"boxes":[{"id":"1","caption":"大きい"}]}]}`, nil).Body.Close()
	}()
	s, msg := ask()
	if s != http.StatusOK {
		t.Fatalf("answer: %d %s", s, msg)
	}
	var out struct{ Over []FitOver }
	json.Unmarshal([]byte(msg), &out)
	if len(out.Over) != 1 || out.Over[0].Short != 40 || out.Over[0].Axis != "x" || out.Over[0].Boxes[0].ID != "1" || out.Over[0].Paper != "a4-landscape 1123x794" {
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

// matomezu open（ask）は、届ける前にカレントの画面に判定を頼む（open の印つき）。収まらなければ届けずに over を返し、
// 収まれば「届いています」を送る。画面が無ければ判定せずに届ける。判定の間は登録せず、開けなかったブックはマスターの一覧から外す（docs/PAPER-plan.md の 4.6 の 7）
func TestOpenAsksTheScreenToJudgeFirst(t *testing.T) {
	_, ts, _ := setupHub(t)
	path := filepath.Join(t.TempDir(), "a.json")
	if err := os.WriteFile(path, []byte(`{"nodes":[{"id":1,"x":5000,"y":0}]}`), 0o644); err != nil {
		t.Fatal(err)
	}
	token := map[string]string{"X-Matomezu-Token": "secret"}
	body, _ := json.Marshal(map[string]any{"path": path, "ask": true})
	open := func() (int, OpenResult, string) {
		res := do(t, "POST", ts.URL+"/api/open", string(body), token)
		defer res.Body.Close()
		b, _ := io.ReadAll(res.Body)
		var o OpenResult
		json.Unmarshal(b, &o)
		return res.StatusCode, o, string(b)
	}
	// 画面が無ければ判定せずに届けておく（あとでつながった画面に送り直す。その画面がブックを開くときに判定する）
	if s, o, msg := open(); s != http.StatusOK || len(o.Over) != 0 {
		t.Fatalf("no screen: %d %s", s, msg)
	}
	res := do(t, "GET", ts.URL+"/api/events", "", nil)
	defer res.Body.Close()
	r := bufio.NewReader(res.Body)
	nextEvent(t, r, "hello")
	nextEvent(t, r, "notify") // 送り直し
	answer := func(over string) {
		go func() {
			var q struct{ Req, Doc, Open, Name string }
			json.Unmarshal([]byte(nextEvent(t, r, "fit")), &q)
			if q.Open != "true" || q.Name != "a.json" {
				do(t, "POST", ts.URL+"/api/fit/"+q.Req, `{"error":"not for open"}`, nil).Body.Close()
				return
			}
			do(t, "POST", ts.URL+"/api/fit/"+q.Req, `{"over":`+over+`}`, nil).Body.Close()
		}()
	}
	// 一覧に載っているか（マスター。開けなかったブックは載せない。前から載っていれば外す）
	listed := func() bool {
		res := do(t, "GET", ts.URL+"/api/books", "", nil)
		defer res.Body.Close()
		var out struct{ Books []BookInfo }
		json.NewDecoder(res.Body).Decode(&out)
		for _, b := range out.Books {
			if b.Name == "a.json" {
				return true
			}
		}
		return false
	}
	if !listed() { // 画面が無いときに届けたので載っている
		t.Fatal("not listed after the open without a screen")
	}
	answer(`[{"page":"","name":"最初のページ","paper":"a4-landscape 1123x794","axis":"x","short":40,"boxes":[{"id":"1","caption":""}]}]`)
	if s, o, msg := open(); s != http.StatusOK || len(o.Over) != 1 || o.Over[0].Short != 40 {
		t.Fatalf("misfit: %d %s", s, msg)
	}
	if listed() {
		t.Fatal("a diagram that could not be opened is still listed")
	}
	answer(`[]`)
	s, o, msg := open()
	if s != http.StatusOK || len(o.Over) != 0 {
		t.Fatalf("fits: %d %s", s, msg)
	}
	// 収まらなかったときは届けていないので、最初の notify は収まったときのもの
	if v := nextEvent(t, r, "notify"); !strings.Contains(v, `"arrive":"true"`) || !strings.Contains(v, o.ID) {
		t.Fatalf("notify = %s", v)
	}
}
