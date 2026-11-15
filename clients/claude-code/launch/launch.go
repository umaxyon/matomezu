// Package launch は、Claude Code のプラグインが matomezu を起動するときの、Claude Code の事情（matomezu claude-code の中身のうち、Claude Code に依る所）。
package launch

import "time"

// SessionEnv は、Claude Code が立てたプロセス（MCP・フック・monitor）に渡す、立てたときのセッション id の環境変数（MCP と monitor では /clear でも変わらない）
const SessionEnv = "CLAUDE_CODE_SESSION_ID"

// ProjectDirEnv は、Claude Code がフック・monitor・MCP に渡す、開いているプロジェクトのフォルダの環境変数
const ProjectDirEnv = "CLAUDE_PROJECT_DIR"

// Claude Code の monitor は、1 行を約 500 字で、続けて出した行を 1 回の知らせにまとめて約 3,000 字で切る。間を 1 秒空ければ別の知らせになる
const (
	MaxLine   = 480
	MaxNotice = 2800
	Gap       = time.Second
)

// SessionEndsWith は、mcp --session-ends-with の値: セッションと同じだけ生きるプロセス。matomezu が親をたどって当たったプロセス（名前 name は小文字、.exe を除いた物）が
// Claude Code の本体なら、その会話 1 つだけを受け持つので program。確かめられるのはネイティブの版（claude）だけで、npm で入れた版（node）は node で動くほかのプログラムと
// 見分けられないので名乗らない（空）
func SessionEndsWith(name string) string {
	if name == "claude" {
		return "program"
	}
	return ""
}

// HooksSendHost は、フックが AI のプログラムのプロセス id を添えるか。Claude Code の本体は会話ごとなので、/clear で変わったセッション id を同じ参加者に結び直すのに使える
const HooksSendHost = true
