package launch

import (
	"encoding/json"
	"os"
	"strings"
	"testing"
)

// 字数を数える見本の行（中身の字数をコメントに書く）
const (
	sayLine         = `{"type":"user","isSidechain":false,"message":{"role":"user","content":"こんにちは"}}`                                                                                                                                                                    // 5
	answerLine      = `{"type":"assistant","isSidechain":false,"message":{"content":[{"type":"text","text":"hello"},{"type":"thinking","thinking":"","signature":"xxxxxxxx"}]}}`                                                                                           // 5
	bashUseLine     = `{"type":"assistant","isSidechain":false,"message":{"content":[{"type":"tool_use","id":"t1","name":"Bash","input":{"command":"ls"},"caller":{"type":"direct"}}]}}`                                                                                   // 4 + 2
	bashResultLine  = `{"type":"user","isSidechain":false,"message":{"content":[{"type":"tool_result","tool_use_id":"t1","content":"abc"}]}}`                                                                                                                              // 3
	mzUseLine       = `{"type":"assistant","isSidechain":false,"message":{"content":[{"type":"tool_use","id":"m1","name":"mcp__plugin_matomezu_matomezu__view","input":{"page":"p1"}}]}}`                                                                                  // 35 + 2
	mzResultLine    = `{"type":"user","isSidechain":false,"message":{"content":[{"type":"tool_result","tool_use_id":"m1","content":[{"type":"text","text":"0123456789"}]}]}}`                                                                                              // 10
	hookTextLine    = `{"type":"attachment","isSidechain":false,"attachment":{"type":"hook_success","hookName":"UserPromptSubmit","toolUseID":"h1","content":"matomezu: 1 note","stdout":"matomezu: 1 note\n","command":"matomezu claude-code hook prompt","exitCode":0}}` // 16
	otherHookLine   = `{"type":"attachment","isSidechain":false,"attachment":{"type":"hook_success","hookName":"SessionStart","content":"pulled","stdout":"pulled\n","command":"sh sync.sh"}}`                                                                             // 6
	hookJSONLine    = `{"type":"attachment","isSidechain":false,"attachment":{"type":"hook_additional_context","content":["You joined matomezu. Workroom name: a"],"hookName":"UserPromptSubmit","toolUseID":"hook-1","hookEvent":"UserPromptSubmit"}}`                    // 37
	hookSayLine     = `{"type":"attachment","isSidechain":false,"attachment":{"type":"hook_system_message","content":"matomezu に参加しました","hookName":"UserPromptSubmit","toolUseID":"h2","hookEvent":"UserPromptSubmit"}}`                                                   // 16
	otherJSONLine   = `{"type":"attachment","isSidechain":false,"attachment":{"type":"hook_additional_context","content":["The memory index is big"],"hookName":"PostToolUse:Edit"}}`                                                                                      // 23
	compactLine     = `{"type":"system","subtype":"compact_boundary","isSidechain":false,"compactMetadata":{"trigger":"auto","preTokens":267299}}`
	sideLine        = `{"type":"user","isSidechain":true,"message":{"role":"user","content":"ignored text"}}`
	blobLine        = `{"type":"api-request-blob","message":{"role":"system","content":"not in the conversation"}}`
	skillUseLine    = `{"type":"assistant","isSidechain":false,"message":{"content":[{"type":"tool_use","id":"s1","name":"Skill","input":{"skill":"matomezu:join","args":"a"}}]}}` // 5 + 13 + 1
	skillResultLine = `{"type":"user","isSidechain":false,"message":{"content":[{"type":"tool_result","tool_use_id":"s1","content":"Launching skill: matomezu:join"}]}}`           // 30
	skillBodyLine   = `{"type":"user","isSidechain":false,"isMeta":true,"sourceToolUseID":"s1","message":{"role":"user","content":[{"type":"text","text":"1. Call join_rules"}]}}` // 18
)

// wakeText は、起こす知らせを包んだターンの入力
var wakeText = taskNotification + "\n<task-id>b1</task-id>\n<summary>Monitor event: \"" + MonitorDescription + "\"</summary>\n<event>matomezu: hi</event>\n</task-notification>"

func wakeUserLine() string {
	b, _ := json.Marshal(map[string]any{"type": "user", "isSidechain": false, "message": map[string]any{"role": "user", "content": wakeText}})
	return string(b)
}

func queuedWakeLine() string {
	other := taskNotification + "<summary>Agent \"x\" finished</summary></task-notification>"
	b, _ := json.Marshal(map[string]any{"type": "attachment", "isSidechain": false, "attachment": map[string]any{
		"type": "queued_command", "prompt": other + "\n" + wakeText, "commandMode": "task-notification", "timestamp": "2026-11-27T00:00:00Z",
	}})
	return string(b)
}

func readChars(t *testing.T, path, from string) CharsRead {
	t.Helper()
	got, ok := ReadContextChars(path, from)
	if !ok {
		t.Fatalf("%s from %q was not read", path, from)
	}
	return got
}

// 字数は会話の行の文字列の rune の数。matomezu の分は、matomezu の MCP 公開ツールの呼び出しと結果・matomezu のフックが足した文・起こす知らせ・join のスキル。
// sidechain・会話でない行・写しの添えた物は数えない
func TestReadContextChars(t *testing.T) {
	wakeN := runes(wakeText)
	for name, c := range map[string]struct {
		text  string
		chars ContextChars
	}{
		"plain":         {lines(sayLine, answerLine, bashUseLine, bashResultLine), ContextChars{Total: 5 + 5 + 6 + 3}},
		"matomezu tool": {lines(mzUseLine, mzResultLine, bashResultLine), ContextChars{Total: 37 + 10 + 3, Matomezu: 37 + 10}},
		"hook text":     {lines(hookTextLine, otherHookLine), ContextChars{Total: 16 + 6, Matomezu: 16}},
		"hook json":     {lines(hookJSONLine, hookSayLine, otherJSONLine), ContextChars{Total: 37 + 16 + 23, Matomezu: 37 + 16}},
		"wake notice":   {lines(wakeUserLine(), queuedWakeLine()), ContextChars{Total: wakeN + runes(taskNotification+"<summary>Agent \"x\" finished</summary></task-notification>\n"+wakeText), Matomezu: 2 * wakeN}},
		"join skill":    {lines(skillUseLine, skillResultLine, skillBodyLine, sayLine), ContextChars{Total: 19 + 30 + 18 + 5, Matomezu: 19 + 30 + 18}},
		"not counted":   {lines(sideLine, blobLine, sayLine), ContextChars{Total: 5}},
		"compact":       {lines(mzUseLine, mzResultLine, compactLine, sayLine), ContextChars{Total: 5}},
		"half written":  {lines(sayLine) + mzUseLine[:30], ContextChars{Total: 5}},
	} {
		path := writeTranscript(t, c.text)
		got := readChars(t, path, "")
		if !got.Restart || got.Chars != c.chars {
			t.Errorf("%s: got %+v, want %+v", name, got, c.chars)
		}
	}
	if _, ok := ReadContextChars("", ""); ok {
		t.Error("no transcript should not be read")
	}
}

// 続きは印から読む。書きかけの行は、書き終えてから読む。結果が次の読みに来た matomezu のツールの呼び出しも、印が持つ id で matomezu の分に数える。
// 圧縮の境目を読んだら数え直す。印が読めないか、ファイルが印の所より短い（別のファイル）ときは頭から
func TestReadContextCharsFromMark(t *testing.T) {
	path := writeTranscript(t, lines(sayLine, mzUseLine)+bashUseLine[:20])
	first := readChars(t, path, "")
	if !first.Restart || first.Chars != (ContextChars{Total: 5 + 37, Matomezu: 37}) {
		t.Fatalf("first = %+v", first)
	}
	again := readChars(t, path, first.Mark)
	if again.Restart || again.Chars != (ContextChars{}) || again.Mark != first.Mark {
		t.Fatalf("nothing new = %+v", again)
	}
	appendTo(t, path, bashUseLine[20:]+"\n"+lines(mzResultLine, bashResultLine))
	next := readChars(t, path, first.Mark)
	if next.Restart || next.Chars != (ContextChars{Total: 6 + 10 + 3, Matomezu: 10}) {
		t.Fatalf("next = %+v", next)
	}
	appendTo(t, path, lines(compactLine, mzUseLine))
	if after := readChars(t, path, next.Mark); !after.Restart || after.Chars != (ContextChars{Total: 37, Matomezu: 37}) {
		t.Fatalf("after the boundary = %+v", after)
	}
	short := writeTranscript(t, lines(sayLine))
	if got := readChars(t, short, next.Mark); !got.Restart || got.Chars != (ContextChars{Total: 5}) {
		t.Fatalf("a shorter file = %+v", got)
	}
	if got := readChars(t, short, "not a mark"); !got.Restart || got.Chars != (ContextChars{Total: 5}) {
		t.Fatalf("an unreadable mark = %+v", got)
	}
}

// 読む塊より長い行も 1 行として数える
func TestReadContextCharsLongLine(t *testing.T) {
	long := strings.Repeat("あ", 200_000)
	b, _ := json.Marshal(map[string]any{"type": "user", "message": map[string]any{"content": long}})
	if got := readChars(t, writeTranscript(t, lines(string(b), sayLine)), ""); got.Chars.Total != 200_005 {
		t.Fatalf("long line = %+v", got)
	}
}

// 印が持つ、結果を待つ呼び出しの id は上限まで（古い物から捨てる）
func TestOpenCallsAreBounded(t *testing.T) {
	var m charsMark
	for i := range openCallsMax + 5 {
		m.openCall(contentBlock{Type: "tool_use", ID: "m" + string(rune('A'+i)), Name: "mcp__matomezu__view"})
	}
	if len(m.Tools) != openCallsMax || m.Tools[0] != "m"+string(rune('A'+5)) {
		t.Fatalf("tools = %d %v", len(m.Tools), m.Tools[:2])
	}
}

// 見分けに使う名前は、プラグインの monitor の説明とフックのコマンドに合う
func TestMatomezuMarksMatchThePlugin(t *testing.T) {
	var monitors []struct {
		Description string `json:"description"`
	}
	data, err := os.ReadFile("../monitors/monitors.json")
	if err != nil || json.Unmarshal(data, &monitors) != nil || len(monitors) != 1 || monitors[0].Description != MonitorDescription {
		t.Fatalf("monitors.json = %s %v", data, err)
	}
	var hooks struct {
		Hooks map[string][]struct {
			Hooks []struct {
				Command string `json:"command"`
			} `json:"hooks"`
		} `json:"hooks"`
	}
	data, err = os.ReadFile("../hooks/hooks.json")
	if err != nil || json.Unmarshal(data, &hooks) != nil || len(hooks.Hooks) == 0 {
		t.Fatalf("hooks.json = %v", err)
	}
	for event, groups := range hooks.Hooks {
		for _, g := range groups {
			for _, h := range g.Hooks {
				if !strings.HasPrefix(h.Command, matomezuHookCommand) {
					t.Errorf("%s: %q", event, h.Command)
				}
			}
		}
	}
	if _, err := os.Stat("../skills/join/SKILL.md"); err != nil || !strings.HasSuffix(joinSkill, ":join") {
		t.Errorf("join skill: %v", err)
	}
}

func appendTo(t *testing.T, path, text string) {
	t.Helper()
	f, err := os.OpenFile(path, os.O_APPEND|os.O_WRONLY, 0)
	if err != nil {
		t.Fatal(err)
	}
	defer f.Close()
	if _, err := f.WriteString(text); err != nil {
		t.Fatal(err)
	}
}

// モデルに渡した物の写しの見本（中身の字数をコメントに書く）
const (
	promptLine1  = `{"type":"attachment","isSidechain":false,"attachment":{"type":"prompt_snapshot","systemPrompt":["You are an agent"],"reminderFold":false,"contextRendering":"announced"}}`                                                                                                                                            // 16
	promptLine2  = `{"type":"attachment","isSidechain":false,"attachment":{"type":"prompt_snapshot","systemPrompt":["You are an agent"],"cliPrefix":"CLI","tools":[{"name":"Bash","description":"run","input_schema":{"type":"object","properties":{"command":{"type":"string","description":"cmd"}}}}],"contextRendering":"announced"}}` // 16 + 3 + 4 + 3 + 3
	loadedLine   = `{"type":"attachment","isSidechain":false,"attachment":{"type":"deferred_tools_record","entries":[{"name":"mcp__plugin_matomezu_matomezu__join","description":"Join","input_schema":{"type":"object"},"defer_loading":true},{"name":"TaskStop","description":"Stop","input_schema":{"type":"object"}}]}}`              // 35 + 4 + 8 + 4
	reloadedLine = `{"type":"attachment","isSidechain":false,"attachment":{"type":"deferred_tools_record","entries":[{"name":"TaskStop","description":"Stop","input_schema":{"type":"object"}}]}}`                                                                                                                                        // 8 + 4
	copiesLine   = `{"type":"attachment","isSidechain":false,"attachment":{"type":"deferred_tools_record","entries":[],"toolInputCopies":[{"id":"toolu_1","copy":"wire"}]}}`                                                                                                                                                              // 0
	mcpLine      = `{"type":"attachment","isSidechain":false,"attachment":{"type":"mcp_instructions_delta","addedNames":["plugin:matomezu:matomezu","other"],"addedBlocks":["## plugin:matomezu:matomezu\nshows books","## other\nx"],"removedNames":[]}}`                                                                                // 39 + 10
	mcpAgainLine = `{"type":"attachment","isSidechain":false,"attachment":{"type":"mcp_instructions_delta","addedNames":["plugin:matomezu:matomezu"],"addedBlocks":["## plugin:matomezu:matomezu\nshows books"],"removedNames":[]}}`
	mcpGoneLine  = `{"type":"attachment","isSidechain":false,"attachment":{"type":"mcp_instructions_delta","addedNames":[],"addedBlocks":[],"removedNames":["plugin:matomezu:matomezu"]}}`
)

// モデルに渡した物の写しは、モデルに今見えている分だけを数える: システムプロンプトの写しは最後の物だけ、後で読み込んだツールの説明とサーバーの説明は名前ごとに 1 度
// （外したサーバーはまた足したときに数え直す）。matomezu のツールとサーバーの説明は matomezu の分、システムプロンプトは分母だけ
func TestReadContextCharsCountsWhatTheModelSees(t *testing.T) {
	for name, c := range map[string]struct {
		text  string
		chars ContextChars
	}{
		"latest prompt only": {lines(promptLine1, sayLine, promptLine2), ContextChars{Total: 29 + 5}},
		"loaded tools once":  {lines(loadedLine, copiesLine, reloadedLine), ContextChars{Total: 51, Matomezu: 39}},
		"mcp once":           {lines(mcpLine, mcpAgainLine), ContextChars{Total: 49, Matomezu: 39}},
		"mcp removed":        {lines(mcpLine, mcpGoneLine, mcpAgainLine), ContextChars{Total: 88, Matomezu: 78}},
		"after the boundary": {lines(promptLine2, loadedLine, mcpLine, compactLine, promptLine1, loadedLine, mcpAgainLine), ContextChars{Total: 16 + 51 + 39, Matomezu: 39 + 39}},
	} {
		if got := readChars(t, writeTranscript(t, c.text), ""); got.Chars != c.chars {
			t.Errorf("%s: got %+v, want %+v", name, got.Chars, c.chars)
		}
	}
}

// 印は、数えたシステムプロンプトの写しの字数と、数えたツールとサーバーの名前を持ち越す。次の読みの新しい写しは入れ替える分だけを足し、
// 同じツール・サーバーは足さない
func TestModelSeesAcrossReads(t *testing.T) {
	path := writeTranscript(t, lines(promptLine1, loadedLine, mcpLine))
	first := readChars(t, path, "")
	if first.Chars != (ContextChars{Total: 16 + 51 + 49, Matomezu: 39 + 39}) {
		t.Fatalf("first = %+v", first)
	}
	appendTo(t, path, lines(promptLine2, reloadedLine, mcpAgainLine))
	if next := readChars(t, path, first.Mark); next.Restart || next.Chars != (ContextChars{Total: 13}) {
		t.Fatalf("next = %+v", next)
	}
}

// matomezu のサーバーの名前は、matomezu の MCP 公開ツールの名前の前置きと同じ 2 つ
func TestMatomezuServersMatchToolPrefixes(t *testing.T) {
	if len(matomezuServers) != len(toolPrefixes) {
		t.Fatal(matomezuServers)
	}
	for _, s := range matomezuServers {
		if !contains(toolPrefixes, "mcp__"+strings.ReplaceAll(s, ":", "_")+"__") {
			t.Errorf("%s has no tool prefix", s)
		}
	}
}
