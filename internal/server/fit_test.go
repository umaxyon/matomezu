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

// 紙に収まらなかったページは、向き・並び・足りない px と、折り返さないこと、取れる手段を書く（set と open が断ったとき）
func TestOverText(t *testing.T) {
	got := OverText("lead:", []FitOver{
		{Page: "", Paper: "a4-landscape 1123x794", Axis: "x", Short: 40, Boxes: []FitBox{{ID: "1", Caption: "A"}, {ID: "2", Caption: "B"}}},
		{Page: "p2", Name: "二枚目", Paper: "a5-portrait 559x794", Axis: "y", Short: 7, Boxes: []FitBox{{ID: "9", Caption: "C"}}},
	})
	for _, want := range []string{
		"lead:\n  first page, paper a4-landscape 1123x794: the row #1 A, #2 B is 40px wider than the paper",
		"\n  page p2 (二枚目), paper a5-portrait 559x794: the column #9 C is 7px taller than the paper",
		"never wrapped", "world.paper",
	} {
		if !strings.Contains(got, want) {
			t.Fatalf("missing %q in:\n%s", want, got)
		}
	}
}

// ブックを見せる知らせ（notify にファイル）は、送る前に画面に判定を頼む（画面には何も出させない）。収まらなければ送らずに原因を返し、
// マスターの一覧にも載せない。LLM が check を飛ばしても、収まらないブックがユーザーに届かない（docs/PAPER-plan.md の 4.6 の 7。2026-10-18）
func TestNotifyWithABookIsJudgedFirst(t *testing.T) {
	_, ts, _ := setupHub(t)
	path := filepath.Join(t.TempDir(), "wide.json")
	if err := os.WriteFile(path, []byte(`{"nodes":[{"id":1}]}`), 0o644); err != nil {
		t.Fatal(err)
	}
	res := do(t, "GET", ts.URL+"/api/events", "", nil)
	defer res.Body.Close()
	r := bufio.NewReader(res.Body)
	nextEvent(t, r, "hello")
	got := make(chan map[string]string, 1)
	go func() {
		var q map[string]string
		json.Unmarshal([]byte(nextEvent(t, r, "fit")), &q)
		do(t, "POST", ts.URL+"/api/fit/"+q["req"], `{"over":[{"page":"","paper":"a4-landscape 1123x794","axis":"x","short":40,"boxes":[{"id":"1","caption":"横"}]}]}`, nil).Body.Close()
		got <- q
	}()
	body, _ := json.Marshal(map[string]any{"title": "見て", "path": path})
	out := do(t, "POST", ts.URL+"/api/notify", string(body), map[string]string{"X-Matomezu-Token": "secret"})
	b, _ := io.ReadAll(out.Body)
	out.Body.Close()
	if out.StatusCode != http.StatusBadRequest || !strings.Contains(string(b), "not shown to the user") || !strings.Contains(string(b), "the row #1 横 is 40px wider") {
		t.Fatalf("notify: %d %s", out.StatusCode, b)
	}
	if q := <-got; q["open"] != "" || q["doc"] != docID(path) {
		t.Fatalf("fit request: %+v", q)
	}
	list := do(t, "GET", ts.URL+"/api/books", "", nil)
	lb, _ := io.ReadAll(list.Body)
	list.Body.Close()
	if strings.Contains(string(lb), "wide.json") {
		t.Fatal("listed")
	}
}
