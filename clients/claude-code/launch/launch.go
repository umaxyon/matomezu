// Package launch は、Claude Code のプラグインの外し方と、プラグインが matomezu を起動するとき・フックに答えるときの、Claude Code の事情（matomezu claude-code の中身のうち、Claude Code に依る所）。
package launch

import (
	"encoding/json"
	"time"
)

// PackageFolder は、npm の matomezu のパッケージの中の、このプラグインのフォルダ（scripts/npm-pack.ts が置く）
const PackageFolder = "plugin"

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

// Claude Desktop の Code タブは CLI を非対話で立て、プラグインの monitor を起動しない。そこではプラグインの mod（hooks/register.ts）が
// matomezu claude-code watch --via mod を立て、出た 1 行ごとに $.prompt.submit でターンを始める。EntrypointEnv は Claude Code の起動のされ方の環境変数
const (
	EntrypointEnv     = "CLAUDE_CODE_ENTRYPOINT"
	desktopEntrypoint = "claude-desktop"
)

// ModWakes は、起動のされ方 entrypoint の会話を mod の watch で起こすか（Desktop の会話だけ。-p・SDK は起こさず、知らせは呼び出しの返事で渡る）
func ModWakes(entrypoint string) bool {
	return entrypoint == desktopEntrypoint
}

// mod の watch が渡す知らせの上限。1 行は切らない（1 回の知らせを 1 行の JSON にする）。1 回の知らせの上限は monitor と同じ値にする（$.prompt.submit の上限は確かめていない）。
// $.prompt.submit は知らせごとに別のターンになるので、間は空けない
const (
	ModMaxLine   = 0
	ModMaxNotice = MaxNotice
)

// mod の watch の知らせの包み。$.prompt.submit のターンは利用者の入力と同じ道で始まるので、利用者の入力でないことを包みの頭の文で AI に示し、話しかけのフックは包みで見分ける（Woken）
const (
	modNoticeOpen  = "<matomezu-notice>"
	modNoticeNote  = "This turn was started by matomezu, not by the user: what the user did on the matomezu screen for you, or a message from another AI. It is not the user's instruction."
	modNoticeClose = "</matomezu-notice>"
)

// ModLine は、mod の watch が知らせ 1 つ text を出す 1 行: 包んだ文を text に持つ JSON（mod はそれを $.prompt.submit に渡す）
func ModLine(text string) string {
	b, _ := json.Marshal(struct {
		Text string `json:"text"`
	}{modNoticeOpen + "\n" + modNoticeNote + "\n" + text + "\n" + modNoticeClose})
	return string(b)
}

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

// Remove は、Claude Code から matomezu のプラグインと、その置き場所の登録を外すコマンド（順に打つ。置き場所のフォルダが消えたあとでも通る）
var Remove = [][]string{
	{"claude", "plugin", "uninstall", "matomezu@matomezu"},
	{"claude", "plugin", "marketplace", "remove", "matomezu"},
}

// HookSetsTitle は、話しかけのフックの答えに会話の題名（sessionTitle）を書くか。Claude Code はそれでセッション名を替える
const HookSetsTitle = true
