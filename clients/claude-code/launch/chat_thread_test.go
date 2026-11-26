package launch

import (
	"os"
	"path/filepath"
	"testing"
)

// チャットスレッドの id は、フックの host の sessions/<host>.json の hostSessionId。セッション id が違う・ファイルが無い・壊れている・hostSessionId が無い（子の CLI）ときは空
func TestChatThread(t *testing.T) {
	dir := t.TempDir()
	t.Setenv("CLAUDE_CONFIG_DIR", dir)
	if err := os.MkdirAll(filepath.Join(dir, "sessions"), 0o700); err != nil {
		t.Fatal(err)
	}
	write := func(pid, body string) {
		if err := os.WriteFile(filepath.Join(dir, "sessions", pid+".json"), []byte(body), 0o600); err != nil {
			t.Fatal(err)
		}
	}
	write("13484", `{"pid":13484,"sessionId":"S1","hostSessionId":"local_67b1","entrypoint":"claude-desktop"}`)
	write("57728", `{"pid":57728,"sessionId":"S2","entrypoint":"claude-desktop"}`)
	write("99", `{"sessionId":`)
	for _, c := range []struct{ host, session, want string }{
		{"13484", "S1", "local_67b1"},
		{"13484", "S9", ""},
		{"57728", "S2", ""},
		{"99", "S1", ""},
		{"404", "S1", ""},
		{"", "S1", ""},
	} {
		if got := ChatThread(c.host, c.session); got != c.want {
			t.Errorf("ChatThread(%q, %q) = %q, want %q", c.host, c.session, got, c.want)
		}
	}
}
