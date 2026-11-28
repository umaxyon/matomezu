// Package orca は、ADE の Orca の事情: 今の worktree の表示名を読み、書き換える。
// Orca は、その中で起動した端末に環境変数 ORCA_CLI_COMMAND（Orca の CLI のコマンド）を置く。無ければ Orca の中ではないので何もしない。
// 表示名は worktree ごとに 1 つ。CLI を呼ぶフォルダから worktree を調べ、書くときはそのパスを指定する
package orca

import (
	"context"
	"encoding/json"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"
)

// CommandEnv は、Orca の CLI のコマンドを置く環境変数
const CommandEnv = "ORCA_CLI_COMMAND"

// timeout は、CLI を 1 度待つ長さ（1 回 2 秒ほどかかる）
const timeout = 6 * time.Second

// nameMax は、表示名の長さの上限（文字数）
const nameMax = 120

// answer は、CLI の --json の答えのうち使う所
type answer struct {
	OK     bool `json:"ok"`
	Result struct {
		Worktree worktree `json:"worktree"`
	} `json:"result"`
}

type worktree struct {
	Path        string `json:"path"`
	DisplayName string `json:"displayName"`
}

// run は、フォルダ dir で CLI に args を渡し、答えの worktree を返す（Orca の中でない・失敗したら空）
func run(dir string, args ...string) worktree {
	command := strings.TrimSpace(os.Getenv(CommandEnv))
	if command == "" || dir == "" {
		return worktree{}
	}
	ctx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()
	cmd := exec.CommandContext(ctx, command, append(args, "--json")...)
	cmd.Dir = dir
	out, err := cmd.Output()
	if err != nil {
		return worktree{}
	}
	// 答えの前に、CLI がほかの行を書くことがある
	if i := strings.IndexByte(string(out), '{'); i > 0 {
		out = out[i:]
	}
	var a answer
	if json.Unmarshal(out, &a) != nil || !a.OK {
		return worktree{}
	}
	return a.Result.Worktree
}

// Name は、フォルダ dir の worktree の表示名（Orca の中でない・読めなければ空）
func Name(dir string) string {
	return run(dir, "worktree", "current").DisplayName
}

// Rename は、フォルダ dir の worktree の表示名を name にする。CLI が遅いので、前に書いた名前と同じなら呼ばない
// （書いた名前は、フォルダ cache のファイルに worktree のフォルダごとに覚える。cache が空なら毎回呼ぶ）
func Rename(dir, name, cache string) {
	name = trimName(name)
	if os.Getenv(CommandEnv) == "" || dir == "" || name == "" {
		return
	}
	written := readWritten(cache)
	if written[dir] == name {
		return
	}
	// dir が worktree の中のフォルダでも、current が返す worktree のパスを指す
	current := run(dir, "worktree", "current")
	if current.Path == "" {
		return
	}
	if run(dir, "worktree", "set", "--worktree", "path:"+current.Path, "--display-name", name).DisplayName != name {
		return
	}
	written[dir] = name
	writeWritten(cache, written)
}

func trimName(name string) string {
	name = strings.TrimSpace(name)
	if r := []rune(name); len(r) > nameMax {
		return string(r[:nameMax])
	}
	return name
}

const cacheFile = "orca-names.json"

func readWritten(cache string) map[string]string {
	written := map[string]string{}
	if cache == "" {
		return written
	}
	if b, err := os.ReadFile(filepath.Join(cache, cacheFile)); err == nil {
		_ = json.Unmarshal(b, &written)
	}
	return written
}

func writeWritten(cache string, written map[string]string) {
	if cache == "" {
		return
	}
	b, err := json.Marshal(written)
	if err != nil {
		return
	}
	tmp := filepath.Join(cache, cacheFile+".tmp")
	if os.WriteFile(tmp, b, 0o600) == nil {
		_ = os.Rename(tmp, filepath.Join(cache, cacheFile))
	}
}
