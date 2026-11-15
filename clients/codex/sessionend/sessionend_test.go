package sessionend

import "testing"

// 今の見立ては、会話の MCP のプロセスの終わりで知る（実測の根拠はパッケージの説明）
func TestWatch(t *testing.T) {
	if got := Watch(); got != MCPProcess {
		t.Fatalf("Watch() = %q", got)
	}
}
