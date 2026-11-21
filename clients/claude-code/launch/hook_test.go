package launch

import (
	"bytes"
	"encoding/json"
	"strings"
	"testing"
)

// matomezu の MCP 公開ツールの名前は、自分で登録した物とプラグインが持つ物の 2 つの前置きから取り出す。ほかのツールと、名前の無い前置きだけの物は matomezu の MCP 公開ツールでない
func TestMatomezuTool(t *testing.T) {
	for full, want := range map[string]string{
		"mcp__matomezu__view":                      "view",
		"mcp__plugin_matomezu_matomezu__read_page": "read_page",
		"mcp__other__list_books":                   "",
		"Bash":                                     "",
		"mcp__plugin_matomezu_matomezu__":          "",
	} {
		name, ok := MatomezuTool(full)
		if name != want || ok != (want != "") {
			t.Errorf("%s: got %q %v", full, name, ok)
		}
	}
}

// 聞かずに使ってよいという答えは、PreToolUse の permissionDecision allow
func TestAllowTool(t *testing.T) {
	var out bytes.Buffer
	AllowTool(&out, "why")
	if !strings.Contains(out.String(), `"permissionDecision":"allow"`) || !strings.Contains(out.String(), `"hookEventName":"PreToolUse"`) {
		t.Fatalf("out = %q", out.String())
	}
}

// 裏の知らせで始まったターンの入力は <task-notification> か、mod の watch の包みで始まる。利用者の入力はそうでない
func TestWoken(t *testing.T) {
	var line struct{ Text string }
	if err := json.Unmarshal([]byte(ModLine("matomezu: a message from sub1_work")), &line); err != nil || !Woken(line.Text) {
		t.Errorf("the mod's notice should be woken: %q %v", line.Text, err)
	}
	if !Woken("<task-notification>\n<summary>Monitor event: \"matomezu\"</summary>\n</task-notification>") {
		t.Error("task-notification should be woken")
	}
	if Woken("こんにちは") {
		t.Error("a user's prompt should not be woken")
	}
}

// mod の watch が起こすのは Claude Desktop の会話だけ（-p・SDK・ターミナルは起こさない）
func TestModWakesOnlyDesktop(t *testing.T) {
	if !ModWakes("claude-desktop") || ModWakes("cli") || ModWakes("sdk-ts") || ModWakes("") {
		t.Error("only claude-desktop")
	}
}

// mod の watch の 1 行は JSON 1 行で、本文の改行も 1 行に収まり、利用者の入力でないと言う文と本文を持つ
func TestModLineIsOneJSONLineWithTheNoteAndTheText(t *testing.T) {
	l := ModLine("a\nb")
	var v struct{ Text string }
	if strings.Contains(l, "\n") || json.Unmarshal([]byte(l), &v) != nil || !strings.Contains(v.Text, modNoticeNote) || !strings.Contains(v.Text, "\na\nb\n") {
		t.Fatalf("%q", l)
	}
}
