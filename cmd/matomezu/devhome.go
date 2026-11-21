package main

// 開発の常駐: matomezu のリポジトリ（git の共通のフォルダの隣に開発の常駐 .dev-home がある）から使うときは、その常駐（.dev-home の実行ファイルと保管庫フォルダ）を使う。
// AI のプラグインは PATH の matomezu を呼ぶので、それが .dev-home の実行ファイルでなければ、.dev-home の実行ファイルを同じ引数で起動し直す

import (
	"fmt"
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

// devVersion は、手元で作った開発の版の version（npm で配る版は、作るときに版の番号を埋め込む）
const devVersion = "dev"

// devRoot は、フォルダ dir が matomezu のリポジトリ（作業ツリーを含む）の中なら、開発の常駐のあるリポジトリの根（無ければ空）。
// 開発の版（version が devVersion）のときだけ見る。配る版が開いたフォルダの .dev-home の実行ファイルを起動すると、よそのリポジトリに置かれた物が利用者の権限で動くため。
// git を呼ばずに .git を読む（.git がファイルなら gitdir と commondir をたどる。git の無い Windows でも同じ）
func devRoot(dir string) string {
	if version != devVersion {
		return ""
	}
	return repoDevRoot(dir)
}

// repoDevRoot は、フォルダ dir が、開発の常駐のある matomezu のリポジトリの中なら、その根（無ければ空。版を問わない）
func repoDevRoot(dir string) string {
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

// devNotUsed は、配る版の matomezu が、開発の常駐のあるリポジトリの中（dir）で呼ばれたときの知らせ（開発の常駐でなく、利用者の保管庫を使っている）。当たらなければ空
func devNotUsed(dir string) string {
	if version == devVersion {
		return ""
	}
	root := repoDevRoot(dir)
	if root == "" {
		return ""
	}
	return fmt.Sprintf("This matomezu (version %s) is not the development build, so it uses the user's vault, not the development server of %s. To use that, put %s first on PATH.", version, root, filepath.Join(root, devHomeDir))
}

// useDevHere は、利用者が手で打つコマンド（serve・start・stop・open）の保管庫を決める: MATOMEZU_HOME が無く、今いるフォルダが matomezu のリポジトリなら、
// その開発の常駐を使い（useDev）、根を返す（ほかは空）。配る版がリポジトリの中で呼ばれたら、そのことを標準エラーに出す
func useDevHere() string {
	if os.Getenv(home.EnvHome) != "" {
		return ""
	}
	wd, _ := os.Getwd()
	if note := devNotUsed(wd); note != "" {
		fmt.Fprintln(os.Stderr, note)
	}
	root := devRoot(wd)
	if root != "" {
		useDev(root)
	}
	return root
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
