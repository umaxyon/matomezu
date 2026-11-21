// Package orca は、AI のセッションを並べて起動する道具 Orca の事情: 今の worktree の表示名を読み、書き換える。
// Orca は、その中で起動した端末に環境変数 ORCA_CLI_COMMAND（Orca の CLI のコマンド）を置く。無ければ Orca の中ではないので何もしない。
// 表示名は worktree ごとに 1 つで、CLI の worktree の active は、CLI を呼んだフォルダで決まる（外で呼ぶと黙って効かない）
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
		Worktree struct {
			DisplayName string `json:"displayName"`
		} `json:"worktree"`
	} `json:"result"`
}

// run は、フォルダ dir で CLI に args を渡し、答えの表示名を返す（Orca の中でない・失敗したら空）
func run(dir string, args ...string) string {
	command := strings.TrimSpace(os.Getenv(CommandEnv))
	if command == "" || dir == "" {
		return ""
	}
	ctx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()
	cmd := exec.CommandContext(ctx, command, append(args, "--json")...)
	cmd.Dir = dir
	out, err := cmd.Output()
	if err != nil {
		return ""
	}
	// 答えの前に、CLI がほかの行を書くことがある
	if i := strings.IndexByte(string(out), '{'); i > 0 {
		out = out[i:]
	}
	var a answer
	if json.Unmarshal(out, &a) != nil || !a.OK {
		return ""
	}
	return a.Result.Worktree.DisplayName
}

// Name は、フォルダ dir の worktree の表示名（Orca の中でない・読めなければ空）
func Name(dir string) string {
	return run(dir, "worktree", "current")
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
	if run(dir, "worktree", "set", "--worktree", "active", "--display-name", name) != name {
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
