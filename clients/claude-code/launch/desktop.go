package launch

// Claude Desktop だけを入れた人には PATH に claude が無い。Desktop は Code タブのために Claude Code の CLI を自分の置き場に落とし、
// その CLI も %USERPROFILE%\.claude（~/.claude）のプラグインを読み書きするので、matomezu はそれでプラグインを入れる。
// 置き場は Anthropic が公に決めた物ではない。2026-11 に Windows の Desktop（CLI 2.1.330）で <置き場>\claude-code\<版>\<hash>\claude.exe を実測した。
// 変わったら見つからず、CLI を入れるか Code タブを開くよう断るだけで、壊れはしない

import (
	"os"
	"path/filepath"
)

// DesktopCLI は、Desktop が置いた CLI の 1 つ（版と実行ファイル）
type DesktopCLI struct {
	Version, Path string
}

// DesktopRoots は、Desktop が CLI を置く claude-code のフォルダの候補。goos が windows なら appData（%APPDATA%）と、
// ストアの形（MSIX）で入れた Desktop が書き込みを移す localAppData（%LOCALAPPDATA%）\Packages\Claude_*\LocalCache\Roaming の下
func DesktopRoots(goos, appData, localAppData string) []string {
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
