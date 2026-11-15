package main

// プラグインの置き場所（matomezu plugin-path）: AI のプログラムに matomezu のプラグインを入れるときに渡すフォルダを出す。
// npm で入れた matomezu は、入口が本体のパッケージのフォルダを packageDirEnv で伝える（node の入れ方で場所が変わり、npm root -g が指さないこともある）。
// 開発の常駐の実行ファイル（リポジトリの .dev-home）なら、リポジトリの clients/<AI の名前>

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"

	claudelaunch "github.com/umaxyon/matomezu/clients/claude-code/launch"
	codexlaunch "github.com/umaxyon/matomezu/clients/codex/launch"
)

// packageDirEnv は、matomezu の npm の入口が、本体のパッケージのフォルダを子の実行ファイルに伝える環境変数
const packageDirEnv = "MATOMEZU_PACKAGE_DIR"

type pluginPathCmd struct {
	AI string `arg:"" enum:"claude-code,codex" help:"The AI program to add the plugin to: claude-code or codex."`
}

// packageFolders は、AI の名前から、npm のパッケージの中のプラグインのフォルダ
var packageFolders = map[string]string{
	"claude-code": claudelaunch.PackageFolder,
	"codex":       codexlaunch.PackageFolder,
}

// Run は、プラグインのフォルダを 1 行で出す
func (c *pluginPathCmd) Run() error {
	dir, err := pluginPath(c.AI, os.Getenv(packageDirEnv), selfExecutable())
	if err != nil {
		return err
	}
	fmt.Println(dir)
	return nil
}

// pluginPath は、AI の名前 ai のプラグインのフォルダ。pkg は入口が伝えた本体のパッケージのフォルダ（無ければ空）、exe はこの実行ファイル
func pluginPath(ai, pkg, exe string) (string, error) {
	if pkg != "" {
		dir := filepath.Join(pkg, packageFolders[ai])
		if isDir(dir) {
			return dir, nil
		}
	}
	if real, err := filepath.EvalSymlinks(exe); err == nil {
		exe = real
	}
	if filepath.Base(filepath.Dir(exe)) == devHomeDir {
		dir := filepath.Join(filepath.Dir(filepath.Dir(exe)), "clients", ai)
		if isDir(dir) {
			return dir, nil
		}
	}
	return "", errors.New("the plugin folder was not found (it comes with matomezu installed by npm: npm i -g matomezu)")
}

// isDir は、dir がフォルダか
func isDir(dir string) bool {
	info, err := os.Stat(dir)
	return err == nil && info.IsDir()
}
