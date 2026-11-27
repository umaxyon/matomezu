package launch

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// 会話の記録の見本の行
const (
	messageLine   = `{"timestamp":"t","type":"response_item","payload":{"type":"message","role":"user","content":[{"type":"input_text","text":"hi"}]}}`
	countLine     = `{"timestamp":"t","type":"event_msg","payload":{"type":"token_count","info":{"total_token_usage":{"input_tokens":104016241,"cached_input_tokens":102656384},"last_token_usage":{"input_tokens":237919,"cached_input_tokens":237696,"cache_write_input_tokens":0,"output_tokens":38,"total_tokens":237957},"model_context_window":475000}}}`
	laterLine     = `{"timestamp":"t","type":"event_msg","payload":{"type":"token_count","info":{"last_token_usage":{"input_tokens":20091,"cached_input_tokens":19072,"output_tokens":67},"model_context_window":475000}}}`
	nullInfoLine  = `{"timestamp":"t","type":"event_msg","payload":{"type":"token_count","info":null,"rate_limits":{}}}`
	compactedLine = `{"timestamp":"t","type":"compacted","payload":{"message":"","replacement_history":[]}}`
	// outputLine は、ツールの結果の文の中に、量の知らせと圧縮の印と同じ文字を持つ行
	outputLine = `{"timestamp":"t","type":"response_item","payload":{"type":"custom_tool_call_output","output":"{\"type\":\"compacted\"} token_count"}}`
)

func writeRollout(t *testing.T, text string) string {
	t.Helper()
	path := filepath.Join(t.TempDir(), "rollout.jsonl")
	if err := os.WriteFile(path, []byte(text), 0o600); err != nil {
		t.Fatal(err)
	}
	return path
}

func lines(ls ...string) string { return strings.Join(ls, "\n") + "\n" }

// 今の量は、最後の量の知らせの last_token_usage の input_tokens（キャッシュの分を引かない）、物差しは model_context_window。
// info が null の知らせとツールの結果の中の文字では決めない。圧縮の印のあとは、次の知らせまで読めない。書きかけの最後の行は読まない
func TestReadContextUse(t *testing.T) {
	for name, c := range map[string]struct {
		text string
		want ContextUse
	}{
		"plain":           {lines(messageLine, countLine, messageLine), ContextUse{Used: 237919, AIScale: 475000}},
		"latest":          {lines(countLine, laterLine), ContextUse{Used: 20091, AIScale: 475000}},
		"null info":       {lines(countLine, nullInfoLine), ContextUse{Used: 237919, AIScale: 475000}},
		"tool output":     {lines(countLine, outputLine), ContextUse{Used: 237919, AIScale: 475000}},
		"after compacted": {lines(countLine, compactedLine, messageLine), NoContextUse},
		"count after it":  {lines(countLine, compactedLine, laterLine), ContextUse{Used: 20091, AIScale: 475000}},
		"half written":    {lines(countLine) + laterLine[:60], ContextUse{Used: 237919, AIScale: 475000}},
		"only half":       {countLine[:50], NoContextUse},
		"no count":        {lines(messageLine), NoContextUse},
	} {
		if got := ReadContextUse(writeRollout(t, c.text)); got != c.want {
			t.Errorf("%s: got %+v, want %+v", name, got, c.want)
		}
	}
	if got := ReadContextUse(filepath.Join(t.TempDir(), "none.jsonl")); got != NoContextUse {
		t.Errorf("a missing rollout = %+v", got)
	}
}

// 読む塊より長い行も、塊をまたいで 1 行として読む
func TestReadContextUseAcrossChunks(t *testing.T) {
	long := `{"type":"response_item","payload":{"type":"message","content":"` + strings.Repeat("x", contextChunk*2) + `"}}`
	if got := ReadContextUse(writeRollout(t, lines(countLine, long))); got.Used != 237919 {
		t.Errorf("across chunks = %+v", got)
	}
}
