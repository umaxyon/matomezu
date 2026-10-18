package server

import (
	"encoding/json"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

// 差分: 箱は id ごと（足した・消した・項目を変えた）、並び順、world の項目
func TestDiffDocs(t *testing.T) {
	a := `{"world":{"title":"前"},"nodes":[{"id":1,"caption":"A","x":0},{"id":2,"caption":"B"}],"edges":[[1,2]]}`
	b := `{"world":{"title":"後"},"nodes":[{"id":2,"caption":"B"},{"id":1,"caption":"A","x":100},{"id":3,"caption":"C"}],"edges":[]}`
	got := map[string]Change{}
	for _, c := range diffDocs([]byte(a), []byte(b)) {
		got[c.Kind+":"+c.Key+":"+c.Op] = c
	}
	if c, ok := got["node:1:change"]; !ok || strings.Join(c.Fields, ",") != "x" || string(c.Before["x"]) != "0" || string(c.After["x"]) != "100" {
		t.Fatalf("node 1 = %+v", got)
	}
	for _, k := range []string{"node:3:add", "edge:1>2:remove", "order:nodes:order", "world::change"} {
		if _, ok := got[k]; !ok {
			t.Fatalf("missing %s in %+v", k, got)
		}
	}
}

// 取り消し: 変えた項目は前の値（後から別の人が変えていても上書き）、足した箱は子孫とつながる線ごと消し、消した物は戻す
func TestRevertChanges(t *testing.T) {
	before := `{"nodes":[{"id":1,"caption":"A","x":0},{"id":9,"caption":"消す"}],"edges":[]}`
	after := `{"nodes":[{"id":1,"caption":"A","x":100},{"id":2,"caption":"足した"}],"edges":[{"id":"e1","from":1,"to":2}]}`
	chs := diffDocs([]byte(before), []byte(after))
	// その後、ユーザーが 2 の中に子を足し、1 の x を 200 に
	cur := `{"nodes":[{"id":1,"caption":"A","x":200},{"id":2,"caption":"足した"},{"id":3,"parent":2,"caption":"子"}],"edges":[{"id":"e1","from":1,"to":2}]}`
	out, err := revertChanges([]byte(cur), chs)
	if err != nil {
		t.Fatal(err)
	}
	var d struct {
		Nodes []map[string]any `json:"nodes"`
		Edges []map[string]any `json:"edges"`
	}
	json.Unmarshal(out, &d)
	ids := []string{}
	for _, n := range d.Nodes {
		ids = append(ids, scalar(mustJSON(n["id"])))
		if n["id"].(float64) == 1 && n["x"].(float64) != 0 {
			t.Fatalf("x = %v", n["x"])
		}
	}
	if strings.Join(ids, ",") != "1,9" || len(d.Edges) != 0 {
		t.Fatalf("nodes = %v edges = %v", ids, d.Edges)
	}
}

func mustJSON(v any) json.RawMessage { b, _ := json.Marshal(v); return b }

// 画面の保存は記録しない。ファイルの直接の書き換えは記録する。見ていない変更を画面の保存が上書きしたら印。seen で見た印。取り消しも記録。DELETE で消える
func TestLLMHistory(t *testing.T) {
	hub, ts, _ := setupStoreHub(t)
	p := filepath.Join(t.TempDir(), "a.json")
	os.WriteFile(p, []byte(`{"nodes":[{"id":1,"caption":"A","x":0}]}`), 0o644)
	res, err := hub.Open(p)
	if err != nil {
		t.Fatal(err)
	}
	base := ts.URL + "/d/" + res.ID
	entries := func() []LLMEntry {
		var out struct{ Entries []LLMEntry }
		json.NewDecoder(do(t, "GET", base+"/api/llm", "", nil).Body).Decode(&out)
		return out.Entries
	}
	version := func() string { return strings.Trim(do(t, "GET", base+"/api/data", "", nil).Header.Get("ETag"), `"`) }
	// 画面の保存（記録しない）
	if r := do(t, "PUT", base+"/api/data", `{"nodes":[{"id":1,"caption":"A","x":10}]}`, map[string]string{"If-Match": `"` + version() + `"`}); r.StatusCode != http.StatusNoContent {
		t.Fatalf("put = %d", r.StatusCode)
	}
	if got := entries(); len(got) != 0 {
		t.Fatalf("after page save = %+v", got)
	}
	// LLM の書き換え（読み直しで見つけて記録する）
	os.WriteFile(p, []byte(`{"nodes":[{"id":1,"caption":"LLM","x":10}]}`), 0o644)
	v := version()
	got := entries()
	if len(got) != 1 || got[0].N != 1 || got[0].Version != v || got[0].Changes[0].Fields[0] != "caption" {
		t.Fatalf("after LLM = %+v", got)
	}
	// 見ていないうちに画面の保存がキャプションを戻した → 印
	do(t, "PUT", base+"/api/data", `{"nodes":[{"id":1,"caption":"A","x":10}]}`, map[string]string{"If-Match": `"` + v + `"`})
	if got := entries(); len(got[0].Overwritten) != 1 || got[0].Overwritten[0].Items[0] != "node:1:caption" {
		t.Fatalf("overwritten = %+v", got)
	}
	// seen
	do(t, "POST", base+"/api/llm/seen", `{"version":"`+v+`"}`, nil)
	if got := entries(); !got[0].Seen {
		t.Fatalf("seen = %+v", got)
	}
	// 取り消し（管理の鍵が要る）
	if r := do(t, "POST", base+"/api/llm/1/revert", "{}", nil); r.StatusCode != http.StatusForbidden {
		t.Fatalf("revert without token = %d", r.StatusCode)
	}
	os.WriteFile(p, []byte(`{"nodes":[{"id":1,"caption":"LLM2","x":10}]}`), 0o644)
	time.Sleep(10 * time.Millisecond)
	if r := do(t, "POST", base+"/api/llm/2/revert", "{}", map[string]string{"X-Matomezu-Token": "secret"}); r.StatusCode != http.StatusOK {
		t.Fatalf("revert = %d", r.StatusCode)
	}
	b, _ := os.ReadFile(p)
	if !strings.Contains(string(b), `"caption": "A"`) {
		t.Fatalf("reverted file = %s", b)
	}
	if got := entries(); len(got) != 3 || got[2].Note != "revert 2" {
		t.Fatalf("after revert = %+v", got)
	}
	do(t, "DELETE", base+"/api/llm", "{}", nil)
	if got := entries(); len(got) != 0 {
		t.Fatalf("after delete = %+v", got)
	}
}

// 計算の書き戻し（X-Matomezu-Save: layout。画面が大きさや押し込んだ位置を計算し直して書いただけ）は、ユーザーの保存として扱わない:
// まだ見ていない LLM の変更と同じ項目を書いても、「ユーザーが上書きした」印を付けない（D44 の 4.3）
func TestLayoutSaveIsNotAUserSave(t *testing.T) {
	hub, ts, _ := setupStoreHub(t)
	p := filepath.Join(t.TempDir(), "a.json")
	os.WriteFile(p, []byte(`{"nodes":[{"id":1,"caption":"A","x":0}]}`), 0o644)
	res, err := hub.Open(p)
	if err != nil {
		t.Fatal(err)
	}
	base := ts.URL + "/d/" + res.ID
	entries := func() []LLMEntry {
		var out struct{ Entries []LLMEntry }
		json.NewDecoder(do(t, "GET", base+"/api/llm", "", nil).Body).Decode(&out)
		return out.Entries
	}
	version := func() string { return strings.Trim(do(t, "GET", base+"/api/data", "", nil).Header.Get("ETag"), `"`) }
	version()
	// LLM が位置を紙の外に書いた
	os.WriteFile(p, []byte(`{"nodes":[{"id":1,"caption":"A","x":5000}]}`), 0o644)
	v := version()
	if got := entries(); len(got) != 1 {
		t.Fatalf("after LLM = %+v", got)
	}
	// 画面が押し込んで書き戻した（計算の書き戻し）→ 印を付けない
	r := do(t, "PUT", base+"/api/data", `{"nodes":[{"id":1,"caption":"A","x":1000,"width":120,"height":64}]}`, map[string]string{"If-Match": `"` + v + `"`, "X-Matomezu-Save": "layout"})
	if r.StatusCode != http.StatusNoContent {
		t.Fatalf("put = %d", r.StatusCode)
	}
	if got := entries(); len(got) != 1 || len(got[0].Overwritten) != 0 {
		t.Fatalf("layout save marked the LLM change: %+v", got)
	}
}
