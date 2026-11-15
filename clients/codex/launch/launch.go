// Package launch は、Codex のプラグインが matomezu を起動するときの、Codex の事情（matomezu codex の中身のうち、Codex に依る所）。
// Codex は MCP にもフックにも開いているプロジェクトのフォルダを教えないので、プラグインを入れた元（設定の [marketplaces.matomezu] の source）で開発の常駐を見分ける
package launch

import (
	"bufio"
	"os"
	"path/filepath"
	"strconv"
	"strings"
)

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
