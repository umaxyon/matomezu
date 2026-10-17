package server

import (
	"encoding/json"
	"net/http"
	"os"
	"path/filepath"
	"testing"
)

func postNew(t *testing.T, url, body string, headers map[string]string) (*http.Response, map[string]string) {
	t.Helper()
	h := map[string]string{"Content-Type": "application/json"}
	for k, v := range headers {
		h[k] = v
	}
	res := do(t, "POST", url+"/api/new", body, h)
	var out map[string]string
	if res.StatusCode == http.StatusOK {
		json.NewDecoder(res.Body).Decode(&out)
	}
	return res, out
}

// 新しいブックは、near の図と同じフォルダに題名の名前で作り、ワールドの設定を書いて登録する
func TestNewBookBesideNear(t *testing.T) {
	_, ts, _ := setupHub(t)
	dir := t.TempDir()
	_, a := openVia(t, ts, "secret", filepath.Join(dir, "a.json"))
	res, got := postNew(t, ts.URL, `{"near":"`+a.ID+`","title":"設計 メモ","world":{"title":"設計 メモ","theme":"sticky"}}`, nil)
	if res.StatusCode != http.StatusOK {
		t.Fatalf("status = %d", res.StatusCode)
	}
	if got["path"] != filepath.Join(dir, "設計 メモ.json") {
		t.Fatalf("path = %q", got["path"])
	}
	var data struct {
		World map[string]any `json:"world"`
		Nodes []any          `json:"nodes"`
	}
	b, _ := os.ReadFile(got["path"])
	if err := json.Unmarshal(b, &data); err != nil || data.World["theme"] != "sticky" || data.Nodes == nil || len(data.Nodes) != 0 {
		t.Fatalf("file = %s", b)
	}
	if res := do(t, "GET", ts.URL+"/d/"+got["id"]+"/api/data", "", nil); res.StatusCode != http.StatusOK {
		t.Fatalf("not registered: %d", res.StatusCode)
	}
}

// 画面が最初の箱（ツリーの根）を添えたら、そのまま書く
func TestNewBookWithRoot(t *testing.T) {
	_, ts, _ := setupHub(t)
	dir := t.TempDir()
	_, a := openVia(t, ts, "secret", filepath.Join(dir, "a.json"))
	res, got := postNew(t, ts.URL, `{"near":"`+a.ID+`","title":"組織","world":{"childView":"tree","root":1},"nodes":[{"id":1,"caption":"組織","x":40,"y":40}]}`, nil)
	if res.StatusCode != http.StatusOK {
		t.Fatalf("status = %d", res.StatusCode)
	}
	var data struct {
		World map[string]any   `json:"world"`
		Nodes []map[string]any `json:"nodes"`
	}
	b, _ := os.ReadFile(got["path"])
	if err := json.Unmarshal(b, &data); err != nil || data.World["root"] != float64(1) || len(data.Nodes) != 1 || data.Nodes[0]["caption"] != "組織" {
		t.Fatalf("file = %s", b)
	}
}

// 同じ名前があれば番号を足し（上書きしない）、空の題名は「無題」、区切りの文字は除く
func TestNewBookNames(t *testing.T) {
	_, ts, _ := setupHub(t)
	dir := t.TempDir()
	_, a := openVia(t, ts, "secret", filepath.Join(dir, "a.json"))
	os.WriteFile(filepath.Join(dir, "無題.json"), []byte("keep"), 0o644)
	for _, c := range []struct{ title, want string }{
		{"", "無題-2.json"}, {"  ", "無題-3.json"}, {"a", "a-2.json"}, {"../x/y", "_x_y.json"}, {"..", "無題-4.json"},
	} {
		body, _ := json.Marshal(map[string]any{"near": a.ID, "title": c.title})
		_, got := postNew(t, ts.URL, string(body), nil)
		if got["path"] != filepath.Join(dir, c.want) {
			t.Fatalf("title %q: path = %q, want %q", c.title, got["path"], c.want)
		}
	}
	if b, _ := os.ReadFile(filepath.Join(dir, "無題.json")); string(b) != "keep" {
		t.Fatalf("overwritten: %s", b)
	}
}

// near が無ければ最後に登録した図のフォルダ。登録した図が 1 つも無ければ作らない
func TestNewBookFolderFallback(t *testing.T) {
	_, ts, _ := setupHub(t)
	if res, _ := postNew(t, ts.URL, `{"title":"x"}`, nil); res.StatusCode != http.StatusBadRequest {
		t.Fatalf("no folder: status = %d", res.StatusCode)
	}
	dir := t.TempDir()
	openVia(t, ts, "secret", filepath.Join(dir, "a.json"))
	if _, got := postNew(t, ts.URL, `{"near":"unknown","title":"x"}`, nil); got["path"] != filepath.Join(dir, "x.json") {
		t.Fatalf("path = %q", got["path"])
	}
}

// ほかのサイトのページからの送信（JSON 以外の本文、localhost 以外の Origin）は断る
func TestNewBookRejectsCrossSite(t *testing.T) {
	_, ts, _ := setupHub(t)
	dir := t.TempDir()
	_, a := openVia(t, ts, "secret", filepath.Join(dir, "a.json"))
	body := `{"near":"` + a.ID + `","title":"x"}`
	if res := do(t, "POST", ts.URL+"/api/new", body, map[string]string{"Content-Type": "text/plain"}); res.StatusCode != http.StatusForbidden {
		t.Fatalf("text/plain: status = %d", res.StatusCode)
	}
	if res, _ := postNew(t, ts.URL, body, map[string]string{"Origin": "https://evil.example"}); res.StatusCode != http.StatusForbidden {
		t.Fatalf("foreign origin: status = %d", res.StatusCode)
	}
	if _, err := os.Stat(filepath.Join(dir, "x.json")); err == nil {
		t.Fatal("file was created")
	}
}

// ブックの複製（D23 の段階 2）: 元と同じフォルダに題名の名前で写し、題名を書き換え、作った人をユーザーにして登録する。元は変えない
func TestCopyBook(t *testing.T) {
	_, ts, _ := setupHub(t)
	dir := t.TempDir()
	src := filepath.Join(dir, "a.json")
	os.WriteFile(src, []byte(`{"world":{"title":"設計","madeBy":"ai","theme":"sticky"},"nodes":[{"id":1,"caption":"箱"}],"edges":[]}`), 0o644)
	_, a := openVia(t, ts, "secret", src)
	post := func(body string) (*http.Response, map[string]string) {
		res := do(t, "POST", ts.URL+"/api/copy", body, map[string]string{"Content-Type": "application/json"})
		var out map[string]string
		if res.StatusCode == http.StatusOK {
			json.NewDecoder(res.Body).Decode(&out)
		}
		return res, out
	}
	res, got := post(`{"from":"` + a.ID + `","title":"設計 (2)"}`)
	if res.StatusCode != http.StatusOK || got["path"] != filepath.Join(dir, "設計 (2).json") {
		t.Fatalf("status = %d, path = %q", res.StatusCode, got["path"])
	}
	var data struct {
		World map[string]any   `json:"world"`
		Nodes []map[string]any `json:"nodes"`
	}
	b, _ := os.ReadFile(got["path"])
	if err := json.Unmarshal(b, &data); err != nil || data.World["title"] != "設計 (2)" || data.World["madeBy"] != "user" || data.World["theme"] != "sticky" || len(data.Nodes) != 1 {
		t.Fatalf("file = %s", b)
	}
	if b, _ := os.ReadFile(src); string(b) != `{"world":{"title":"設計","madeBy":"ai","theme":"sticky"},"nodes":[{"id":1,"caption":"箱"}],"edges":[]}` {
		t.Fatalf("source changed: %s", b)
	}
	if res := do(t, "GET", ts.URL+"/d/"+got["id"]+"/api/data", "", nil); res.StatusCode != http.StatusOK {
		t.Fatalf("not registered: %d", res.StatusCode)
	}
	// 知らないブック・ほかのサイトからは断る
	if res, _ := post(`{"from":"nope","title":"x"}`); res.StatusCode != http.StatusNotFound {
		t.Fatalf("unknown: %d", res.StatusCode)
	}
	if res := do(t, "POST", ts.URL+"/api/copy", `{"from":"`+a.ID+`"}`, map[string]string{"Content-Type": "application/json", "Origin": "https://example.com"}); res.StatusCode != http.StatusForbidden {
		t.Fatalf("foreign origin: %d", res.StatusCode)
	}
}
