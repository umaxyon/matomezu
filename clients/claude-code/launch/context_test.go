package launch

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// 会話の記録の見本の行
const (
	userLine      = `{"type":"user","isSidechain":false,"message":{"role":"user","content":"hi"}}`
	plainLine     = `{"type":"assistant","isSidechain":false,"message":{"model":"claude-opus-5-5","usage":{"input_tokens":4,"cache_creation_input_tokens":196,"cache_read_input_tokens":111800,"output_tokens":9}}}`
	advisorLine   = `{"type":"assistant","isSidechain":false,"message":{"model":"claude-opus-5-5","usage":{"input_tokens":99611,"cache_creation_input_tokens":3827,"cache_read_input_tokens":192448,"iterations":[{"type":"message","input_tokens":2,"cache_creation_input_tokens":2500,"cache_read_input_tokens":94974},{"type":"advisor_message","model":"claude-fable-5-2","input_tokens":99607,"cache_creation_input_tokens":0,"cache_read_input_tokens":0},{"type":"message","input_tokens":2,"cache_creation_input_tokens":1327,"cache_read_input_tokens":97474}]}}}`
	sidechainLine = `{"type":"assistant","isSidechain":true,"message":{"model":"claude-haiku-5-5","usage":{"input_tokens":1,"cache_creation_input_tokens":0,"cache_read_input_tokens":5000}}}`
	syntheticLine = `{"type":"assistant","isSidechain":false,"message":{"model":"<synthetic>","usage":{"input_tokens":0,"cache_creation_input_tokens":0,"cache_read_input_tokens":0}}}`
	boundaryLine  = `{"type":"system","subtype":"compact_boundary","isSidechain":false,"compactMetadata":{"trigger":"auto","preTokens":267299}}`
	// toolResultLine は、ツールの結果の文の中に、圧縮の境目と返答の行と同じ文字を持つ利用者の行
	toolResultLine = `{"type":"user","isSidechain":false,"message":{"content":"{\"type\":\"system\",\"subtype\":\"compact_boundary\"} {\"type\":\"assistant\"}"}}`
)

func writeTranscript(t *testing.T, text string) string {
	t.Helper()
	path := filepath.Join(t.TempDir(), "s.jsonl")
	if err := os.WriteFile(path, []byte(text), 0o600); err != nil {
		t.Fatal(err)
	}
	return path
}

func lines(ls ...string) string { return strings.Join(ls, "\n") + "\n" }

// 今の量は、最後の返答の input + cache_creation + cache_read。iterations があれば最後の type message の物（advisor の分は足さない）。
// sidechain と <synthetic> の返答は飛ばし、ツールの結果の中の文字では決めない
func TestLastTurnUsage(t *testing.T) {
	for name, c := range map[string]struct {
		text string
		used int64
		ok   bool
	}{
		"plain":           {lines(userLine, plainLine, userLine), 112000, true},
		"advisor":         {lines(plainLine, advisorLine), 98803, true},
		"sidechain":       {lines(plainLine, sidechainLine), 112000, true},
		"synthetic":       {lines(plainLine, syntheticLine), 112000, true},
		"tool result":     {lines(plainLine, toolResultLine), 112000, true},
		"after boundary":  {lines(plainLine, boundaryLine, userLine), 0, false},
		"answer after it": {lines(plainLine, boundaryLine, userLine, advisorLine), 98803, true},
		"no answer":       {lines(userLine), 0, false},
		"half written":    {lines(plainLine) + advisorLine[:40], 112000, true},
		"only half":       {plainLine[:50], 0, false},
		"no message":      {lines(`{"type":"assistant","message":{"model":"claude-opus-5-5","usage":{"iterations":[{"type":"advisor_message","input_tokens":5}]}}}`), 0, false},
	} {
		got, ok := lastTurnUsage(writeTranscript(t, c.text))
		if ok != c.ok || got.used != c.used || (ok && got.model == "") {
			t.Errorf("%s: got %+v %v, want %d %v", name, got, ok, c.used, c.ok)
		}
	}
	if _, ok := lastTurnUsage(filepath.Join(t.TempDir(), "none.jsonl")); ok {
		t.Error("a missing transcript should not be read")
	}
}

// 塊の大きさより長い行も、塊をまたいで 1 行として読む。読む合計の上限までに返答が無ければ読めない
func TestLastTurnUsageAcrossChunks(t *testing.T) {
	long := `{"type":"user","message":{"content":"` + strings.Repeat("x", contextChunk*2) + `"}}`
	if got, ok := lastTurnUsage(writeTranscript(t, lines(plainLine, long, userLine))); !ok || got.used != 112000 {
		t.Errorf("across chunks: %+v %v", got, ok)
	}
	bigAnswer := strings.Replace(plainLine, `"output_tokens":9`, `"output_tokens":9,"pad":"`+strings.Repeat("y", contextChunk+100)+`"`, 1)
	if got, ok := lastTurnUsage(writeTranscript(t, lines(userLine, bigAnswer))); !ok || got.used != 112000 {
		t.Errorf("long answer: %+v %v", got, ok)
	}
	filler := strings.Repeat(userLine+"\n", contextScan/len(userLine)+1)
	if _, ok := lastTurnUsage(writeTranscript(t, plainLine+"\n"+filler)); ok {
		t.Error("an answer beyond the scan limit should not be read")
	}
}

// モデルの上限の表: Fable・Sonnet 5 以降・Haiku 5.5 以降・Opus 4.7 以降は 1M、それより前は 200k（[1m] が付けば 1M）。表に無いモデルは分からない
func TestModelLimit(t *testing.T) {
	for model, want := range map[string]int64{
		"claude-fable-5-2":           window1m,
		"claude-sonnet-5-5":          window1m,
		"claude-sonnet-5":            window1m,
		"claude-haiku-5-5":           window1m,
		"claude-opus-5-5":            window1m,
		"claude-opus-4-7":            window1m,
		"claude-opus-4-6":            window200k,
		"claude-opus-4-6[1m]":        window1m,
		"claude-sonnet-4-6":          window200k,
		"claude-sonnet-4-5-20250929": window200k,
		"claude-opus-4-20250514":     window200k,
		"claude-haiku-4-5":           window200k,
		"claude-3-7-sonnet-20250219": window200k,
		"gpt-6-sol":                  0,
		"<synthetic>":                0,
	} {
		got, ok := ModelLimit(model)
		if got != want || ok != (want != 0) {
			t.Errorf("%s: got %d %v, want %d", model, got, ok, want)
		}
	}
}

func writeSettings(t *testing.T, path, text string) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, []byte(text), 0o600); err != nil {
		t.Fatal(err)
	}
}

// 自動で縮める所は、設定のフォルダ・プロジェクトの settings.json・settings.local.json の順に重ね（後ろが勝つ）、modelSettings のそのモデルの物が上の段より勝つ。
// 自動の縮めを切る設定と環境変数があれば無い
func TestAutoCompactWindow(t *testing.T) {
	config, project := t.TempDir(), t.TempDir()
	noEnv := func(string) string { return "" }
	writeSettings(t, filepath.Join(config, "settings.json"), `{"autoCompactWindow":300000,"modelSettings":{"claude-fable-5-2":{"autoCompactWindow":400000}}}`)
	if got, ok := AutoCompactWindow("claude-opus-5-5", project, config, noEnv); !ok || got != 300000 {
		t.Errorf("user: %d %v", got, ok)
	}
	if got, _ := AutoCompactWindow("claude-fable-5-2", project, config, noEnv); got != 400000 {
		t.Errorf("model: %d", got)
	}
	writeSettings(t, filepath.Join(project, ".claude", "settings.json"), `{"autoCompactWindow":250000}`)
	writeSettings(t, filepath.Join(project, ".claude", "settings.local.json"), `{"autoCompactWindow":200000}`)
	if got, _ := AutoCompactWindow("claude-opus-5-5", project, config, noEnv); got != 200000 {
		t.Errorf("local wins: %d", got)
	}
	if got, _ := AutoCompactWindow("claude-fable-5-2", project, config, noEnv); got != 400000 {
		t.Errorf("model wins over top level: %d", got)
	}
	if _, ok := AutoCompactWindow("claude-opus-5-5", project, config, func(k string) string {
		if k == "DISABLE_AUTO_COMPACT" {
			return "1"
		}
		return ""
	}); ok {
		t.Error("DISABLE_AUTO_COMPACT should turn it off")
	}
	writeSettings(t, filepath.Join(project, ".claude", "settings.local.json"), `{"autoCompactEnabled":false}`)
	if _, ok := AutoCompactWindow("claude-opus-5-5", project, config, noEnv); ok {
		t.Error("autoCompactEnabled false should turn it off")
	}
	if _, ok := AutoCompactWindow("claude-opus-5-5", t.TempDir(), t.TempDir(), noEnv); ok {
		t.Error("nothing written")
	}
}

// 物差しは自動で縮める所、無ければ（自動の縮めが切られていれば）モデルの上限。表に無いモデルと読めない記録は NoContextUse
func TestReadContextUse(t *testing.T) {
	config, project := t.TempDir(), t.TempDir()
	path := writeTranscript(t, lines(userLine, plainLine))
	noEnv := func(string) string { return "" }
	if got := ReadContextUse(path, project, config, noEnv); got != (ContextUse{Used: 112000, AIScale: window1m}) {
		t.Errorf("limit: %+v", got)
	}
	writeSettings(t, filepath.Join(config, "settings.json"), `{"autoCompactWindow":300000}`)
	if got := ReadContextUse(path, project, config, noEnv); got != (ContextUse{Used: 112000, AIScale: 300000}) {
		t.Errorf("window: %+v", got)
	}
	off := func(k string) string {
		if k == "DISABLE_COMPACT" {
			return "true"
		}
		return ""
	}
	if got := ReadContextUse(path, project, config, off); got.AIScale != window1m {
		t.Errorf("off: %+v", got)
	}
	other := writeTranscript(t, lines(strings.Replace(plainLine, "claude-opus-5-5", "gpt-6-sol", 1)))
	if got := ReadContextUse(other, project, config, noEnv); got != NoContextUse {
		t.Errorf("unknown model: %+v", got)
	}
	if got := ReadContextUse(writeTranscript(t, lines(plainLine, boundaryLine)), project, config, noEnv); got != NoContextUse {
		t.Errorf("after boundary: %+v", got)
	}
}
