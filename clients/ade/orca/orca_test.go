package orca

import (
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

// fakeCLI は、呼ばれるたびに引数を log に 1 行足し、答えの前にほかの行を書いてから、渡された表示名を答える偽の CLI を置く。
// 偽の CLI は sh のスクリプトなので、Windows ではテストを飛ばす（Orca とのやり取りは OS によらないので、ほかの OS で確かめる）
func fakeCLI(t *testing.T) (log string) {
	t.Helper()
	if runtime.GOOS == "windows" {
		t.Skip("the fake CLI is a sh script")
	}
	dir := t.TempDir()
	log = filepath.Join(dir, "calls")
	script := `#!/bin/sh
echo "$@" >> '` + log + `'
name=""
while [ $# -gt 0 ]; do
  if [ "$1" = "--display-name" ]; then name="$2"; fi
  shift
done
[ -z "$name" ] && name="今の名前"
echo "crashpad: noise"
printf '{"ok":true,"result":{"worktree":{"displayName":"%s"}}}\n' "$name"
`
	cli := filepath.Join(dir, "orca")
	if err := os.WriteFile(cli, []byte(script), 0o755); err != nil {
		t.Fatal(err)
	}
	t.Setenv(CommandEnv, cli)
	return log
}

func calls(t *testing.T, log string) []string {
	b, err := os.ReadFile(log)
	if os.IsNotExist(err) {
		return nil
	}
	if err != nil {
		t.Fatal(err)
	}
	return strings.Split(strings.TrimSpace(string(b)), "\n")
}

// Orca の中でなければ（環境変数が無ければ）何もしない
func TestOutsideOrcaDoesNothing(t *testing.T) {
	t.Setenv(CommandEnv, "")
	if got := Name(t.TempDir()); got != "" {
		t.Fatalf("name = %q", got)
	}
	Rename(t.TempDir(), "x", t.TempDir()) // 呼ぶ CLI が無いので、落ちなければよい
}

// 答えの前にほかの行があっても、表示名を読む
func TestNameReadsPastNoise(t *testing.T) {
	fakeCLI(t)
	if got := Name(t.TempDir()); got != "今の名前" {
		t.Fatalf("name = %q", got)
	}
}

// 前に書いた名前と同じなら CLI を呼ばない。名前は 120 字で切る
func TestRenameOnlyWhenChanged(t *testing.T) {
	log := fakeCLI(t)
	dir, cache := t.TempDir(), t.TempDir()
	Rename(dir, "ひよこ T-1 名前", cache)
	Rename(dir, "ひよこ T-1 名前", cache)
	if c := calls(t, log); len(c) != 1 || !strings.Contains(c[0], "--display-name ひよこ T-1 名前") {
		t.Fatalf("calls = %q", c)
	}
	Rename(dir, "ひよこ（空き）", cache)
	if c := calls(t, log); len(c) != 2 {
		t.Fatalf("calls = %q", c)
	}
	long := strings.Repeat("あ", nameMax+5)
	Rename(dir, long, cache)
	c := calls(t, log)
	if len(c) != 3 || !strings.HasSuffix(c[2], "--display-name "+strings.Repeat("あ", nameMax)+" --json") {
		t.Fatalf("calls = %q", c)
	}
}
