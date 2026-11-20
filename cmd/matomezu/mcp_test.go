package main

import (
	"os"
	"strconv"
	"testing"

	codexsessionend "github.com/umaxyon/matomezu/clients/codex/sessionend"
)

func TestSessionPid(t *testing.T) {
	me, parent := strconv.Itoa(os.Getpid()), strconv.Itoa(os.Getppid())
	cases := []struct {
		endsWith, host, entry, want string
	}{
		{"program", "4242", "", "4242"},
		{"program", "", "", ""},
		{"mcp", "4242", "", me},
		{"mcp", "4242", parent, parent},
		{"mcp", "4242", "999999", me},
		{"", "4242", parent, ""},
	}
	for _, c := range cases {
		t.Setenv(entryPIDEnv, c.entry)
		if got := sessionPid(c.endsWith, c.host); got != c.want {
			t.Fatalf("sessionPid(%q, %q) with entry %q = %q, want %q", c.endsWith, c.host, c.entry, got, c.want)
		}
		if got := sessionPidSpace(c.endsWith); (got != "") != (c.endsWith != "") {
			t.Fatalf("sessionPidSpace(%q) = %q", c.endsWith, got)
		}
	}
}

// codex-session-end の見立てを mcp --session-ends-with の値に読み替える: MCP のプロセスなら mcp、分からなければ名乗らない
func TestCodexSessionEndsWith(t *testing.T) {
	cases := []struct {
		watch codexsessionend.Process
		want  string
	}{
		{codexsessionend.MCPProcess, "mcp"},
		{codexsessionend.Unknown, ""},
	}
	for _, c := range cases {
		if got := codexSessionEndsWith(c.watch); got != c.want {
			t.Fatalf("codexSessionEndsWith(%q) = %q, want %q", c.watch, got, c.want)
		}
	}
}

// Claude Code の MCP だけが、Claude Code が渡すセッション id を添える（素の mcp・codex・opencode の mcp は mcpCmd の Session を空のまま使う）
func TestOnlyClaudeCodeMCPSendsTheClaudeCodeSession(t *testing.T) {
	t.Setenv("CLAUDE_CODE_SESSION_ID", "s-1")
	if got := claudeMCP("program"); got.Session != "s-1" || got.SessionEndsWith != "program" {
		t.Fatalf("claude-code mcp: %+v", got)
	}
	if got := (mcpCmd{}).Session; got != "" {
		t.Fatalf("plain mcp: %q", got)
	}
}
