package validate

import (
	"reflect"
	"testing"
)

func TestProblems(t *testing.T) {
	cases := []struct {
		name string
		json string
		want []string
	}{
		{"ok", `{"nodes":[{"id":1},{"caption":"no id"}],"edges":[[1,2]]}`, nil},
		{"not json", `{"nodes":[`, []string{"JSON として読めません: Unexpected end of JSON input (EOF)"}},
		{"many", `{"nodes":[{"id":1,"size":"XL"},{"id":2,"parent":9}],"edges":[{"from":1,"to":2,"exitAt":2}]}`, []string{
			"size の値が不正です: 1 (XL)",
			"存在しない親です: 2 → 9",
			"exitAt は 0 から 1 の数にしてください: 1 - 2 (2)",
			"階層の違うボックス同士の線があります: 1 - 2",
		}},
	}
	for _, c := range cases {
		got, err := Problems([]byte(c.json))
		if err != nil {
			t.Fatalf("%s: %v", c.name, err)
		}
		if len(got) == 0 && len(c.want) == 0 {
			continue
		}
		if !reflect.DeepEqual(got, c.want) {
			t.Errorf("%s:\n got  %q\n want %q", c.name, got, c.want)
		}
	}
}
