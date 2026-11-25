// Package launch は、Claude Code のプラグインの外し方と、プラグインが matomezu を起動するとき・フックに答えるときの、Claude Code の事情（matomezu claude-code の中身のうち、Claude Code に依る所）。
package launch

import "time"

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
	cliEntrypoint     = "cli"
)

// ModWakes は、起動のされ方 entrypoint の会話を mod の watch で起こすか（Desktop の会話だけ。-p・SDK は起こさず、知らせは呼び出しの返事で渡る）
func ModWakes(entrypoint string) bool {
	return entrypoint == desktopEntrypoint
}

// AiUi は、起動のされ方 entrypoint から、利用者がその会話と話している AI の UI（join で常駐に添える値）を返す。
// 端末の会話は terminal、Claude Desktop の Code タブは desktop。ほか（-p・SDK など）は分からないので空（添えない）
func AiUi(entrypoint string) string {
	switch entrypoint {
	case cliEntrypoint:
		return "terminal"
	case desktopEntrypoint:
		return "desktop"
	}
	return ""
}

// mod の watch が渡す知らせの上限。mod は watch の 1 行（JSON の文字列にした知らせ 1 つ。--escaped）を 1 つのターンにするので、行は切らず、間も空けない。
// 1 回の知らせの上限は monitor と同じ値にする。そのターンが知らせで始まったかは、常駐が渡した知らせと照らして決める（talked の prompt）
// 知らせは JSON の文字列の 1 行で受け（ModEscaped。改行を含む知らせも 1 つのターンになる）、mod が読み戻す
const (
	ModMaxLine   = 0
	ModMaxNotice = MaxNotice
	ModGap       = 0
	ModEscaped   = true
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

// Remove は、Claude Code から matomezu のプラグインと、その置き場所の登録を外すコマンド（順に打つ。置き場所のフォルダが消えたあとでも通る）
var Remove = [][]string{
	{"claude", "plugin", "uninstall", "matomezu@matomezu"},
	{"claude", "plugin", "marketplace", "remove", "matomezu"},
}

// HookSetsTitle は、話しかけのフックの答えに会話の題名（sessionTitle）を書くか。Claude Code はそれでセッション名を替える
const HookSetsTitle = true
