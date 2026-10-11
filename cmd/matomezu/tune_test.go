package main

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestApplySets(t *testing.T) {
	in := `{"world":{"width":800},"nodes":[{"id":1,"caption":"A","x":10},{"id":2,"caption":"B","parent":1}],"edges":[],"extra":1}`
	out, _, err := applySets([]byte(in), []string{"1.childView=tree", "1.x=", "2.size=S", "2.fill=false", "world.background=#fff", "1.width=200"})
	if err != nil {
		t.Fatal(err)
	}
	want := `{
  "world": { "width": 800, "background": "#fff" },
  "nodes": [
    { "id": 1, "caption": "A", "childView": "tree", "width": 200 },
    { "id": 2, "caption": "B", "parent": 1, "size": "S", "fill": false }
  ],
  "edges": [],
  "extra": 1
}
`
	if string(out) != want {
		t.Errorf("got\n%s", out)
	}
}

func TestApplySetsErrors(t *testing.T) {
	in := `{"nodes":[{"id":1}]}`
	for _, a := range []string{"9.size=S", "1size=S", "1.=S"} {
		if _, _, err := applySets([]byte(in), []string{a}); err == nil {
			t.Errorf("%s: expected an error", a)
		}
	}
}

func TestApplySetsEdges(t *testing.T) {
	in := `{"nodes":[{"id":1},{"id":2}],"edges":[[1,2],{"id":"e2","from":2,"to":1}]}`
	out, _, err := applySets([]byte(in), []string{"e2.route=elbow", "e2.via=[280, 140]", "e2.arrow=end"})
	if err != nil {
		t.Fatal(err)
	}
	want := `{
  "nodes": [
    { "id": 1 },
    { "id": 2 }
  ],
  "edges": [
    [1, 2],
    { "id": "e2", "from": 2, "to": 1, "route": "elbow", "via": [280, 140], "arrow": "end" }
  ]
}
`
	if string(out) != want {
		t.Errorf("got\n%s", out)
	}
	if _, _, err := applySets([]byte(in), []string{"e9.arrow=end"}); err == nil {
		t.Error("unknown edge: expected an error")
	}
}

func TestCheckDataListsAllProblems(t *testing.T) {
	path := filepath.Join(t.TempDir(), "a.json")
	os.WriteFile(path, []byte(`{"nodes":[{"id":1,"size":"XL"},{"id":2,"parent":9}]}`), 0o644)
	err := checkData(path)
	if err == nil || !strings.Contains(err.Error(), "2 problem(s)") ||
		!strings.Contains(err.Error(), "size の値が不正です: 1 (XL)") || !strings.Contains(err.Error(), "存在しない親です: 2 → 9") {
		t.Fatalf("err = %v", err)
	}
	os.WriteFile(path, []byte(`{"nodes":[{"id":1}]}`), 0o644)
	if err := checkData(path); err != nil {
		t.Fatalf("ok file: %v", err)
	}
}

// 文字の項目（caption など）は、数字や true に見える値でも文字列として書く
func TestApplySetsTextKeys(t *testing.T) {
	out, _, err := applySets([]byte(`{"nodes":[{"id":1}],"edges":[{"id":"e1","from":1,"to":1}]}`),
		[]string{"1.caption=42", "e1.caption=true", "world.title=2026", "1.color=000"})
	if err != nil {
		t.Fatal(err)
	}
	for _, want := range []string{`"caption": "42"`, `"caption": "true"`, `"title": "2026"`, `"color": "000"`} {
		if !strings.Contains(string(out), want) {
			t.Errorf("missing %s in\n%s", want, out)
		}
	}
}

// 検査に通らない変更は、ファイルに書かない
func TestSetDoesNotWriteInvalidData(t *testing.T) {
	path := filepath.Join(t.TempDir(), "a.json")
	orig := `{"nodes":[{"id":1}]}`
	os.WriteFile(path, []byte(orig), 0o644)
	err := set([]string{path, "1.size=XL"})
	if err == nil || !strings.Contains(err.Error(), "size の値が不正です") || !strings.HasPrefix(err.Error(), "not written") {
		t.Fatalf("err = %v", err)
	}
	if b, _ := os.ReadFile(path); string(b) != orig {
		t.Fatalf("file changed:\n%s", b)
	}
}

// web の formatDiagram（test/format.test.ts）と同じ文字列になる
func TestFormatDiagram(t *testing.T) {
	in := `{"world":{"width":800,"background":"#fff"},"nodes":[{"id":1,"caption":"フロントエンド","x":40,"y":60,"body":"1 行目\n\"引用\""},
		{"id":2,"caption":"Web","parent":1,"via":[[1,2],[3,4]],"style":{}}],"edges":[],"pages":[{"id":"p1","nodes":[1]}]}`
	want := `{
  "world": { "width": 800, "background": "#fff" },
  "nodes": [
    { "id": 1, "caption": "フロントエンド", "x": 40, "y": 60, "body": "1 行目\n\"引用\"" },
    { "id": 2, "caption": "Web", "parent": 1, "via": [[1, 2], [3, 4]], "style": {} }
  ],
  "edges": [],
  "pages": [
    { "id": "p1", "nodes": [1] }
  ]
}
`
	got, err := formatDiagram([]byte(in))
	if err != nil {
		t.Fatal(err)
	}
	if string(got) != want {
		t.Fatalf("got:\n%s\nwant:\n%s", got, want)
	}
	if got, _ := formatDiagram([]byte(`{}`)); string(got) != "{}\n" {
		t.Fatalf("empty: %q", got)
	}
}

// link で線を足し（id は空いている e<数>）、unlink で両端か id を指定して消す
func TestApplySetsLink(t *testing.T) {
	in := `{"nodes":[{"id":1},{"id":2},{"id":3},{"id":"x"}],"edges":[[1,2],{"id":"e1","from":2,"to":3}]}`
	out, notes, err := applySets([]byte(in), []string{"link=1,3", `link={"from":3,"to":"x","arrow":"end"}`, "link=x,x", "unlink=2,1", "unlink=e1"})
	if err != nil {
		t.Fatal(err)
	}
	want := `{
  "nodes": [
    { "id": 1 },
    { "id": 2 },
    { "id": 3 },
    { "id": "x" }
  ],
  "edges": [
    { "id": "e2", "from": 1, "to": 3 },
    { "id": "e3", "from": 3, "to": "x", "arrow": "end" },
    { "id": "e4", "from": "x", "to": "x" }
  ]
}
`
	if string(out) != want {
		t.Errorf("got\n%s", out)
	}
	wantNotes := "added edge e2 (1,3)|added edge e3 (3,x)|added edge e4 (x,x)|removed edge 1,2|removed edge e1 (2,3)"
	if got := strings.Join(notes, "|"); got != wantNotes {
		t.Errorf("notes: %s", got)
	}
}

func TestApplySetsLinkErrors(t *testing.T) {
	in := `{"nodes":[{"id":1},{"id":2}],"edges":[{"id":"e1","from":1,"to":2},{"id":"e2","from":1,"to":1},{"id":"e3","from":1,"to":1}]}`
	for a, want := range map[string]string{
		"link=1,9":                         "no box with id 9",
		"link=2,1":                         "already joined by edge e1 (1,2)",
		"link=12":                          "expected link=from,to",
		`link={"id":"e1","from":2,"to":2}`: "edge id e1 is already used",
		"unlink=2,2":                       "no edge between 2 and 2",
		"unlink=1,1":                       "2 edges between 1 and 1 (e2 (1,1), e3 (1,1)); remove one by its id, e.g. unlink=e2",
		"unlink=e9":                        "no edge with id e9",
	} {
		_, _, err := applySets([]byte(in), []string{a})
		if err == nil || !strings.Contains(err.Error(), want) {
			t.Errorf("%s: got %v, want %q", a, err, want)
		}
	}
}

// 付け替えで階層をまたぐ線が残れば、書かずに消し方を案内する。同じ呼び出しで消せば書ける
func TestApplySetsReparentCrossing(t *testing.T) {
	in := `{"nodes":[{"id":1},{"id":4},{"id":9}],"edges":[{"id":"e1","from":9,"to":1},[9,4]]}`
	_, _, err := applySets([]byte(in), []string{"9.parent=4"})
	want := "not written: edge e1 (9,1) joins boxes in different groups (9 is in 4, 1 is at the top level); add unlink=9,1 to remove it; " +
		"edge 9,4 joins boxes in different groups (9 is in 4, 4 is at the top level); add unlink=9,4 to remove it"
	if err == nil || err.Error() != want {
		t.Fatalf("got %v", err)
	}
	out, notes, err := applySets([]byte(in), []string{"9.parent=4", "unlink=9,1", "unlink=9,4", "link=9,9"})
	if err != nil {
		t.Fatal(err)
	}
	// 消した e1 は振り直さない
	if !strings.Contains(string(out), `{ "id": 9, "parent": 4 }`) || !strings.Contains(string(out), `{ "id": "e2", "from": 9, "to": 9 }`) {
		t.Errorf("got\n%s", out)
	}
	if notes[len(notes)-1] != "added edge e2 (9,9)" {
		t.Errorf("notes: %v", notes)
	}
}
