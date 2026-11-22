package home

// 写した実行ファイルの置き場: npm の入口（scripts/npm-pack/manifest.ts の binEntry）が、パッケージの実行ファイルを版ごとのフォルダ <置き場>/<版>/ に写して、そこから動かす。
// 入口は、今入っている版と写した物を印（InstalledName）に書く。置き場の名前は入口の BIN_DIR・INSTALLED_NAME と同じ（テストが見張る）

import (
	"encoding/json"
	"errors"
	"io/fs"
	"os"
	"path/filepath"
	"sort"
)

// InstalledName は、置き場の中の、今入っている版の印のファイル
const InstalledName = "installed.json"

// BinDir は、写した実行ファイルの置き場（ホームの下。保管庫フォルダの場所 EnvHome には左右されない）
func BinDir() (string, error) {
	h, err := os.UserHomeDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(h, ".matomezu", "bin"), nil
}

// Installed は、今入っている版と、その実行ファイル
type Installed struct {
	Version string `json:"version"`
	Exe     string `json:"exe"`
}

// ReadInstalled は、置き場 dir の印。無ければ nil
func ReadInstalled(dir string) (*Installed, error) {
	b, err := os.ReadFile(filepath.Join(dir, InstalledName))
	if errors.Is(err, fs.ErrNotExist) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	var in Installed
	if err := json.Unmarshal(b, &in); err != nil {
		return nil, err
	}
	return &in, nil
}

// PruneBins は、置き場 dir の版のフォルダのうち、keep の版と、それ以外で一番新しく写した版を残し、ほかを消す。
// 動いている物は Windows では消せないので飛ばす（ほかの OS では消せても、動いているプロセスはそのまま動く）
func PruneBins(dir string, keep ...string) {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return
	}
	kept := map[string]bool{}
	for _, k := range keep {
		kept[k] = true
	}
	type found struct {
		name string
		at   int64
	}
	var others []found
	for _, e := range entries {
		if !e.IsDir() || kept[e.Name()] {
			continue
		}
		info, err := e.Info()
		if err != nil {
			continue
		}
		others = append(others, found{e.Name(), info.ModTime().UnixNano()})
	}
	sort.Slice(others, func(i, j int) bool { return others[i].at > others[j].at })
	for i, o := range others {
		if i == 0 {
			continue
		}
		_ = os.RemoveAll(filepath.Join(dir, o.name))
	}
}
