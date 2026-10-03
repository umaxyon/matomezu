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
