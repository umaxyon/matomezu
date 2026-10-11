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
		{"not json", `{"nodes":[`, []string{"Not valid JSON: Unexpected end of JSON input (EOF)"}},
		{"many", `{"nodes":[{"id":1,"size":"XL"},{"id":2,"parent":9}],"edges":[{"from":1,"to":2,"exitAt":2}]}`, []string{
			"invalid size: 1 (XL)",
			"parent does not exist: 2 → 9",
			"exitAt must be a number from 0 to 1: 1 - 2 (2)",
			"line between boxes in different groups: 1 - 2",
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
