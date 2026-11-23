package launch

// Claude Desktop だけを入れた人には PATH に claude が無い。Desktop は Code タブのために Claude Code の CLI を自分の置き場の claude-code/<版>/<hash>/ に置き
// （Windows は claude.exe、macOS は claude.app/Contents/MacOS/claude）、その CLI も ~/.claude のプラグインを読み書きするので、matomezu はそれでプラグインを入れる。
// 置き場は Anthropic が公に決めた物ではないので、見つからなければ NotFoundMessage で断る

import (
	"os"
	"path/filepath"
)

// NotFoundMessage は、PATH にも Desktop の置き場にも claude が無いときの断り
const NotFoundMessage = "Claude Code was not found. Install the Claude Code CLI, or open the Code tab in Claude Desktop once, then run this again"

// RestartDesktopMessage は、Desktop の置き場の CLI でプラグインを入れたあとに出す文（Node と matomezu を入れる前から立っている Desktop は、古い PATH のままで matomezu を見つけられない）
const RestartDesktopMessage = "If Claude Desktop was running, quit it completely (on Windows, from the system tray too; on macOS, with Cmd+Q) and start it again so that it finds matomezu."

// Exe は、OS goos で Desktop が置く CLI の実行ファイルの、<hash> のフォルダからの道
func Exe(goos string) string {
	switch goos {
	case "windows":
		return "claude.exe"
	case "darwin":
		return filepath.Join("claude.app", "Contents", "MacOS", "claude")
	}
	return "claude"
}

// DesktopCLI は、Desktop が置いた CLI の 1 つ（版と実行ファイル）
type DesktopCLI struct {
	Version, Path string
}

// DesktopRoots は、Desktop が CLI を置く claude-code のフォルダの候補。goos が darwin なら home の Library/Application Support の下。
// windows なら appData（%APPDATA%）と、ストアの形（MSIX）で入れた Desktop が書き込みを移す localAppData（%LOCALAPPDATA%）\Packages\Claude_*\LocalCache\Roaming の下
func DesktopRoots(goos, home, appData, localAppData string) []string {
	if goos == "darwin" && home != "" {
		return []string{filepath.Join(home, "Library", "Application Support", "Claude", "claude-code")}
	}
	if goos != "windows" {
		return nil
	}
	var roots []string
	if appData != "" {
		roots = append(roots, filepath.Join(appData, "Claude", "claude-code"))
	}
	if localAppData != "" {
		msix, _ := filepath.Glob(filepath.Join(localAppData, "Packages", "Claude_*", "LocalCache", "Roaming", "Claude", "claude-code"))
		roots = append(roots, msix...)
	}
	return roots
}

// DesktopCLIs は、置き場 roots の <版>\<hash>\<exe> を全部返す（並びは決めない。どれが新しいかは呼ぶ側が版で決める）
func DesktopCLIs(roots []string, exe string) []DesktopCLI {
	var found []DesktopCLI
	for _, root := range roots {
		versions, err := os.ReadDir(root)
		if err != nil {
			continue
		}
		for _, v := range versions {
			if !v.IsDir() {
				continue
			}
			builds, err := os.ReadDir(filepath.Join(root, v.Name()))
			if err != nil {
				continue
			}
			for _, b := range builds {
				p := filepath.Join(root, v.Name(), b.Name(), exe)
				if info, err := os.Stat(p); err == nil && info.Mode().IsRegular() {
					found = append(found, DesktopCLI{Version: v.Name(), Path: p})
				}
			}
		}
	}
	return found
}
