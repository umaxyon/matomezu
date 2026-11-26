package launch

import (
	"encoding/json"
	"os"
	"path/filepath"
)

// claudeSession は、Claude Code が起動するとき <設定のフォルダ>/sessions/<プロセス id>.json に書く、動いている CLI の記録のうち、読む所
type claudeSession struct {
	SessionID     string `json:"sessionId"`
	HostSessionID string `json:"hostSessionId"`
}

// ChatThread は、プロセス id host の Claude Code がセッション session で動いているときの、チャットスレッドの id（無ければ空）。
// Claude Desktop は、チャットスレッドを /clear や --resume で CLI ごと起動し直すが、CLI が起動するときに書く sessions/<プロセス id>.json の
// hostSessionId（Desktop のチャットスレッドの id）は替わらない。このファイルは CLI の起動の時点で書かれ、最初の UserPromptSubmit のフックより前にある。
// Desktop のチャットスレッドの中で立てた子の CLI（claude -p）には hostSessionId が無い。
// 設定のフォルダは CLAUDE_CONFIG_DIR、無ければ ~/.claude。セッション id が違う・読めないときは空
func ChatThread(host, session string) string {
	if host == "" || session == "" {
		return ""
	}
	dir := os.Getenv("CLAUDE_CONFIG_DIR")
	if dir == "" {
		home, err := os.UserHomeDir()
		if err != nil {
			return ""
		}
		dir = filepath.Join(home, ".claude")
	}
	data, err := os.ReadFile(filepath.Join(dir, "sessions", filepath.Base(host)+".json"))
	if err != nil {
		return ""
	}
	var s claudeSession
	if json.Unmarshal(data, &s) != nil || s.SessionID != session {
		return ""
	}
	return s.HostSessionID
}
