package sessionend

import "testing"

// Codex のセッションの終わりは、会話の MCP のプロセスの終わりで知る（根拠はパッケージの説明）
func TestWatch(t *testing.T) {
	if got := Watch(); got != MCPProcess {
		t.Fatalf("Watch() = %q", got)
	}
}
