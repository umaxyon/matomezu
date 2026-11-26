package launch

import (
	"os"
	"path/filepath"
	"slices"
	"strings"
	"testing"
)

// 前の会話は、記録の頭の derived-from の行の、via が clear の claude_code_session だけ。行が 1 行目でなくても読み、launch・subprocess・compact（自分）は取らない。
// 形の版・セッション id が違う・壊れた行・行が無いときは空
func TestClearedFrom(t *testing.T) {
	const me = "3901571f-4bd8-4588-8ab0-dbb6f51a5797"
	derived := func(v, session, sessions string) string {
		return `{"type":"derived-from","v":` + v + `,"sessionId":"` + session + `","sessions":[` + sessions + `]}`
	}
	launch := `{"type":"claude_code_session","id":"f396d2da-0000-0000-0000-000000000000","via":"launch","started":"` + me + `"}`
	cleared := `{"type":"claude_code_session","id":"f396d2da-53ab-4555-aaa8-c95836056383","via":"clear"}`
	parent := `{"type":"claude_code_session","id":"aaaaaaaa-0000-0000-0000-000000000000","via":"subprocess"}`
	self := `{"type":"claude_code_session","id":"` + me + `","via":"compact"}`
	unknown := `{"type":"unknown","id":null,"via":"launch","started":"` + me + `"}`
	for name, c := range map[string]struct {
		lines []string
		want  []string
	}{
		"first line":  {[]string{derived("1", me, launch+","+cleared)}, []string{"f396d2da-53ab-4555-aaa8-c95836056383"}},
		"fifth line":  {[]string{`{"type":"mode"}`, `{"type":"session-owner"}`, `{}`, `{}`, derived("1", me, unknown+","+cleared)}, []string{"f396d2da-53ab-4555-aaa8-c95836056383"}},
		"others only": {[]string{derived("1", me, launch+","+parent+","+self)}, nil},
		"version":     {[]string{derived("2", me, cleared)}, nil},
		"session":     {[]string{derived("1", "bbbbbbbb-0000-0000-0000-000000000000", cleared)}, nil},
		"broken":      {[]string{`{"type":"derived-from",`}, nil},
		"none":        {[]string{`{"type":"user"}`}, nil},
	} {
		path := filepath.Join(t.TempDir(), "t.jsonl")
		if err := os.WriteFile(path, []byte(strings.Join(c.lines, "\n")+"\n"), 0o600); err != nil {
			t.Fatal(err)
		}
		if got := ClearedFrom(path, me); !slices.Equal(got, c.want) {
			t.Errorf("%s: got %v, want %v", name, got, c.want)
		}
	}
	if got := ClearedFrom(filepath.Join(t.TempDir(), "missing.jsonl"), me); got != nil {
		t.Errorf("missing file: got %v", got)
	}
}
