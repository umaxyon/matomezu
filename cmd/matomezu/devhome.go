package main

// 開発の常駐: matomezu のリポジトリ（git の共通のフォルダの隣に開発の常駐 .dev-home がある）から使うときは、その常駐（.dev-home の実行ファイルと保管庫フォルダ）を使う。
// AI のプラグインは PATH の matomezu を呼ぶので、それが .dev-home の実行ファイルでなければ、.dev-home の実行ファイルを同じ引数で起動し直す

import (
	"os"
	"path/filepath"
	"runtime"
	"strings"

	"github.com/umaxyon/matomezu/internal/home"
)

// devHomeDir は、リポジトリの根の下の、開発の常駐の保管庫フォルダ
const devHomeDir = ".dev-home"

// reexecEnv は、開発の実行ファイルを起動し直した印（起動し直した先で、もう一度起動し直さない）
const reexecEnv = "MATOMEZU_DEV_REEXEC"

// devBinary は、リポジトリの根 root の開発の常駐の実行ファイル
func devBinary(root string) string {
	name := "matomezu"
	if runtime.GOOS == "windows" {
		name += ".exe"
	}
	return filepath.Join(root, devHomeDir, name)
}

// devRoot は、フォルダ dir が matomezu のリポジトリ（作業ツリーを含む）の中なら、開発の常駐のあるリポジトリの根（無ければ空）。
// git を呼ばずに .git を読む（.git がファイルなら gitdir と commondir をたどる。git の無い Windows でも同じ）
func devRoot(dir string) string {
	if dir == "" {
		return ""
	}
	dir, err := filepath.Abs(dir)
	if err != nil {
		return ""
	}
	for {
		if common := gitCommonDir(filepath.Join(dir, ".git")); common != "" {
			root := filepath.Dir(common)
			if info, err := os.Stat(devBinary(root)); err == nil && !info.IsDir() {
				return root
			}
			return ""
		}
		up := filepath.Dir(dir)
		if up == dir {
			return ""
		}
		dir = up
	}
}

// gitCommonDir は、.git（フォルダかファイル）の場所 dotGit から、git の共通のフォルダ（無ければ空）
func gitCommonDir(dotGit string) string {
	info, err := os.Stat(dotGit)
	if err != nil {
		return ""
	}
	if info.IsDir() {
		return dotGit
	}
	b, err := os.ReadFile(dotGit)
	if err != nil {
		return ""
	}
	gitdir, ok := strings.CutPrefix(strings.TrimSpace(string(b)), "gitdir:")
	if !ok {
		return ""
	}
	gitdir = strings.TrimSpace(gitdir)
	if !filepath.IsAbs(gitdir) {
		gitdir = filepath.Join(filepath.Dir(dotGit), gitdir)
	}
	common, err := os.ReadFile(filepath.Join(gitdir, "commondir"))
	if err != nil {
		return filepath.Clean(gitdir)
	}
	c := strings.TrimSpace(string(common))
	if !filepath.IsAbs(c) {
		c = filepath.Join(gitdir, c)
	}
	return filepath.Clean(c)
}

// useDev は、リポジトリの根 root の開発の常駐を使う: 保管庫フォルダを合わせ、自分が開発の実行ファイルでなければ、それを同じ引数で起動し直す（戻らない）。
// 起動し直せなければ、自分のまま続ける
func useDev(root string) {
	_ = os.Setenv(home.EnvHome, filepath.Join(root, devHomeDir))
	if os.Getenv(reexecEnv) != "" {
		return
	}
	target, err := filepath.EvalSymlinks(devBinary(root))
	if err != nil {
		return
	}
	if self, err := os.Executable(); err == nil {
		if self, err = filepath.EvalSymlinks(self); err == nil && sameFile(self, target) {
			return
		}
	}
	_ = os.Setenv(reexecEnv, "1")
	reexec(target)
}

// sameFile は、a と b が同じファイルか
func sameFile(a, b string) bool {
	ia, err := os.Stat(a)
	if err != nil {
		return false
	}
	ib, err := os.Stat(b)
	return err == nil && os.SameFile(ia, ib)
}
