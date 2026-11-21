package launch

import (
	"encoding/json"
	"io"
	"strings"
)

// toolPrefixes は、Claude Code がフックに渡す、matomezu の MCP 公開ツールの名前の前置き（自分で登録した物と、プラグインが持つ物で名前が違う）
var toolPrefixes = []string{"mcp__matomezu__", "mcp__plugin_matomezu_matomezu__"}

// MatomezuTool は、Claude Code がフックに渡すツールの名前 full が matomezu の MCP 公開ツールなら、その MCP 公開ツールの名前
func MatomezuTool(full string) (string, bool) {
	for _, prefix := range toolPrefixes {
		if name, ok := strings.CutPrefix(full, prefix); ok && name != "" {
			return name, true
		}
	}
	return "", false
}

// AllowTool は、ツールを使う前のフック（PreToolUse）の、利用者に聞かずに使ってよいという答えを書く（reason はその訳）
func AllowTool(out io.Writer, reason string) {
	_ = json.NewEncoder(out).Encode(map[string]any{"hookSpecificOutput": map[string]any{
		"hookEventName":            "PreToolUse",
		"permissionDecision":       "allow",
		"permissionDecisionReason": reason,
	}})
}

// Woken は、話しかけのフックの入力 prompt が、利用者トリガートークでなく裏の知らせ（プラグインの monitor の 1 行・裏で走らせた物の終わりなど）で
// 始まったターンの物か。Claude Code は、そのターンの入力を <task-notification> で包む（フックに --woken を渡せない）。mod の watch の知らせは ModLine の包みで始まる
func Woken(prompt string) bool {
	p := strings.TrimSpace(prompt)
	return strings.HasPrefix(p, "<task-notification>") || strings.HasPrefix(p, modNoticeOpen)
}
