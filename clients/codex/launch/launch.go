// Package launch は、Codex のプラグインの外し方と、プラグインが matomezu を起動するときの、Codex の事情（matomezu codex の中身のうち、Codex に依る所）。
// Codex は MCP にもフックにも開いているプロジェクトのフォルダを教えないので、プラグインを入れた元（設定の [marketplaces.matomezu] の source）で開発の常駐を見分ける
package launch

import (
	"bufio"
	"os"
	"path/filepath"
	"strconv"
	"strings"
)

// Codex の MCP とフックの親は app-server（いくつもの会話を受け持つ）なので、フックはプロセス id を添えない（結び直しに使えない）

// HooksSendHost は、フックが AI のプログラムのプロセス id を添えるか
const HooksSendHost = false

// MetaModel は、Codex が MCP のツールの呼び出しの _meta に添えるモデルの置き場所（matomezu mcp --meta-model の値。JSON Pointer）
const MetaModel = "/x-codex-turn-metadata/model"

// DeliverArgs は、起こす知らせを Codex の会話に渡すコマンドの、matomezu の実行ファイルに続く引数（Codex には裏で動かし続ける仕組みが無いので、MCP の中の watch が渡す）
var DeliverArgs = []string{"codex", "deliver"}

// PackageFolder は、npm の matomezu のパッケージの中の、このプラグインのフォルダ（scripts/npm-pack.ts が置く）
const PackageFolder = "codex-plugin"

// Home は、Codex の設定のフォルダ（CODEX_HOME、無ければ ~/.codex）
func Home() string {
	if d := os.Getenv("CODEX_HOME"); d != "" {
		return d
	}
	h, err := os.UserHomeDir()
	if err != nil {
		return ""
	}
	return filepath.Join(h, ".codex")
}

// marketplaceSection は、matomezu のプラグインを入れた元を書く設定の節
const marketplaceSection = "[marketplaces.matomezu]"

// InstalledFrom は、Codex の設定のフォルダ codexHome の config.toml から、matomezu のプラグインを入れた元のフォルダを読む（無ければ空）。
// 読むのは節 [marketplaces.matomezu] の source の 1 行だけ（基本の文字列 "..." とリテラルの文字列 '...'）。Windows の Codex が付ける \\?\ の頭は外す
func InstalledFrom(codexHome string) string {
	f, err := os.Open(filepath.Join(codexHome, "config.toml"))
	if err != nil {
		return ""
	}
	defer f.Close()
	inside := false
	sc := bufio.NewScanner(f)
	for sc.Scan() {
		line := strings.TrimSpace(sc.Text())
		if strings.HasPrefix(line, "[") {
			inside = line == marketplaceSection
			continue
		}
		key, value, ok := strings.Cut(line, "=")
		if !inside || !ok || strings.TrimSpace(key) != "source" {
			continue
		}
		return strings.TrimPrefix(tomlString(strings.TrimSpace(value)), `\\?\`)
	}
	return ""
}

// tomlString は、TOML の 1 行の文字列の値の中身（文字列でなければ空）
func tomlString(v string) string {
	switch {
	case strings.HasPrefix(v, "'"):
		if end := strings.IndexByte(v[1:], '\''); end >= 0 {
			return v[1 : end+1]
		}
	case strings.HasPrefix(v, `"`):
		for i := 1; i < len(v); i++ {
			if v[i] == '\\' {
				i++
				continue
			}
			if v[i] == '"' {
				s, err := strconv.Unquote(v[:i+1])
				if err != nil {
					return ""
				}
				return s
			}
		}
	}
	return ""
}

// Remove は、Codex から matomezu のプラグインと、その置き場所の登録を外すコマンド（順に打つ）
var Remove = [][]string{
	{"codex", "plugin", "remove", "matomezu@matomezu"},
	{"codex", "plugin", "marketplace", "remove", "matomezu"},
}

// NotFoundMessage は、フック（hooks/hooks.json）が matomezu を PATH に見つけられないときに Codex に出させる文
const NotFoundMessage = "matomezu was not found. Install it again (npm i -g matomezu) or remove this plugin (codex plugin remove matomezu@matomezu)."

// HookSetsTitle は、話しかけのフックの答えに会話の題名（sessionTitle）を書くか。Codex は知らない項目のある答えを「invalid user prompt submit JSON output」として捨てる
const HookSetsTitle = false
