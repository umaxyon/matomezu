package main

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestApplySets(t *testing.T) {
	in := `{"world":{"width":800},"nodes":[{"id":1,"caption":"A","x":10},{"id":2,"caption":"B","parent":1}],"edges":[],"extra":1}`
	out, err := applySets([]byte(in), []string{"1.childView=tree", "1.x=", "2.size=S", "2.fill=false", "world.background=#fff", "1.width=200"})
	if err != nil {
		t.Fatal(err)
	}
	want := `{
  "world": {
    "width": 800,
    "background": "#fff"
  },
  "nodes": [
    {
      "id": 1,
      "caption": "A",
      "childView": "tree",
      "width": 200
    },
    {
      "id": 2,
      "caption": "B",
      "parent": 1,
      "size": "S",
      "fill": false
    }
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
		if _, err := applySets([]byte(in), []string{a}); err == nil {
			t.Errorf("%s: expected an error", a)
		}
	}
}

func TestApplySetsEdges(t *testing.T) {
	in := `{"nodes":[{"id":1},{"id":2}],"edges":[[1,2],{"id":"e2","from":2,"to":1}]}`
	out, err := applySets([]byte(in), []string{"e2.route=elbow", "e2.via=[280, 140]", "e2.arrow=end"})
	if err != nil {
		t.Fatal(err)
	}
	want := `{
  "nodes": [
    {
      "id": 1
    },
    {
      "id": 2
    }
  ],
  "edges": [
    [
      1,
      2
    ],
    {
      "id": "e2",
      "from": 2,
      "to": 1,
      "route": "elbow",
      "via": [
        280,
        140
      ],
      "arrow": "end"
    }
  ]
}
`
	if string(out) != want {
		t.Errorf("got\n%s", out)
	}
	if _, err := applySets([]byte(in), []string{"e9.arrow=end"}); err == nil {
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
	out, err := applySets([]byte(`{"nodes":[{"id":1}],"edges":[{"id":"e1","from":1,"to":1}]}`),
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
