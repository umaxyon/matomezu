package main

import (
	"os"
	"path/filepath"
	"testing"
)

// プラグインの置き場所: 入口が伝えた本体のパッケージの下、無ければ開発の常駐の実行ファイルのリポジトリの clients、どちらも無ければ誤り
func TestPluginPath(t *testing.T) {
	pkg := t.TempDir()
	for _, d := range []string{"plugin", "codex-plugin"} {
		if err := os.MkdirAll(filepath.Join(pkg, d), 0o755); err != nil {
			t.Fatal(err)
		}
	}
	repo := t.TempDir()
	for _, d := range []string{".dev-home", "clients/claude-code", "clients/codex"} {
		if err := os.MkdirAll(filepath.Join(repo, d), 0o755); err != nil {
			t.Fatal(err)
		}
	}
	devExe := filepath.Join(repo, ".dev-home", "matomezu")
	other := filepath.Join(t.TempDir(), "matomezu")
	for _, c := range []struct{ ai, pkg, exe, want string }{
		{"claude-code", pkg, other, filepath.Join(pkg, "plugin")},
		{"codex", pkg, other, filepath.Join(pkg, "codex-plugin")},
		{"claude-code", "", devExe, filepath.Join(repo, "clients", "claude-code")},
		{"codex", "", devExe, filepath.Join(repo, "clients", "codex")},
		{"codex", "", other, ""},
	} {
		got, err := pluginPath(c.ai, c.pkg, c.exe)
		if got != c.want || (err != nil) != (c.want == "") {
			t.Errorf("pluginPath(%q, %q, %q) = %q, %v; want %q", c.ai, c.pkg, c.exe, got, err, c.want)
		}
	}
}
