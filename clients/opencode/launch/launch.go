// Package launch は、opencode のプラグイン（npm のパッケージ matomezu-opencode）の入れ方・外し方のうち、opencode に依る所。
package launch

import (
	"os"
	"path/filepath"
	"strings"
)

// Package は、opencode のプラグインの npm のパッケージの名前（opencode plugin add で入れる）
const Package = "matomezu-opencode"

// MetaSession は、opencode が MCP のツールの呼び出しの _meta に添えるセッション id の置き場所（matomezu mcp --meta-session の値。JSON Pointer）
var MetaSession = []string{"/ai.opencode~1sessionID"}

// Remove は、opencode から matomezu のプラグインを外すコマンド
var Remove = [][]string{
	{"opencode", "plugin", "remove", Package},
}

// Add は、opencode に matomezu のプラグインの版 version を入れるコマンド（入っている物は、その版に替わる）
func Add(version string) []string {
	return []string{"opencode", "plugin", "add", Package + "@" + version}
}

// Installed は、opencode の利用者の設定（XDG_CONFIG_HOME か ~/.config の opencode/opencode.json か .jsonc）に matomezu のプラグインがあるか
func Installed() bool {
	dir := os.Getenv("XDG_CONFIG_HOME")
	if dir == "" {
		h, err := os.UserHomeDir()
		if err != nil {
			return false
		}
		dir = filepath.Join(h, ".config")
	}
	for _, name := range []string{"opencode.json", "opencode.jsonc"} {
		if b, err := os.ReadFile(filepath.Join(dir, "opencode", name)); err == nil && strings.Contains(string(b), Package) {
			return true
		}
	}
	return false
}
