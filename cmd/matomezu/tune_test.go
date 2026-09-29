package main

import "testing"

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
