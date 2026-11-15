// Package launch は、Claude Code のプラグインが matomezu を起動するときの、Claude Code の事情（matomezu claude-code の中身のうち、Claude Code に依る所）。
package launch

import "time"

// ProjectDirEnv は、Claude Code がフック・monitor・MCP に渡す、開いているプロジェクトのフォルダの環境変数
const ProjectDirEnv = "CLAUDE_PROJECT_DIR"

// Claude Code の monitor は、1 行を約 500 字で、続けて出した行を 1 回の知らせにまとめて約 3,000 字で切る。間を 1 秒空ければ別の知らせになる
const (
	MaxLine   = 480
	MaxNotice = 2800
	Gap       = time.Second
)

// IsProgram は、名前 name（小文字、.exe を除いた物）のプロセスが Claude Code の本体か（ネイティブの版は claude、npm で入れた版は node）。
// 本体のプロセスは、その会話 1 つだけを受け持つ（終わったら会話が終わった）
func IsProgram(name string) bool {
	return name == "claude" || name == "node"
}
