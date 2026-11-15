package main

import (
	"os"
	"testing"
)

// tree は、試しのプロセスの表（pid → procInfo）
type tree map[int]procInfo

func (t tree) table(pid int) (procInfo, bool) {
	p, ok := t[pid]
	return p, ok
}

// AI のプログラムは、中継（シェル・volta・matomezu 自身・npm の入口の node）を飛ばした最初のプロセス
func TestFindHostSkipsTheRelays(t *testing.T) {
	for _, c := range []struct {
		name  string
		tree  tree
		entry int
		want  int
	}{
		{
			name: "Claude Code の MCP（Windows、npm）",
			tree: tree{
				10: {parent: 0, name: "claude.exe", started: 1},
				11: {parent: 10, name: "cmd.exe", started: 2},
				12: {parent: 11, name: "volta.exe", started: 3},
				13: {parent: 12, name: "cmd.exe", started: 4},
				14: {parent: 13, name: "node.exe", started: 5},
				15: {parent: 14, name: "matomezu.exe", started: 6},
			},
			entry: 14, want: 10,
		},
		{
			name: "Claude Code のフック（Git の bash）",
			tree: tree{
				10: {parent: 0, name: "claude.exe", started: 1},
				11: {parent: 10, name: "bash.exe", started: 2},
				12: {parent: 11, name: "bash.exe", started: 3},
				13: {parent: 12, name: "volta.exe", started: 4},
				14: {parent: 13, name: "cmd.exe", started: 5},
				15: {parent: 14, name: "node.exe", started: 6},
				16: {parent: 15, name: "matomezu.exe", started: 7},
			},
			entry: 15, want: 10,
		},
		{
			name: "Codex のフック（PowerShell）は app-server まで",
			tree: tree{
				9:  {parent: 0, name: "codex.exe", started: 1},
				11: {parent: 9, name: "powershell.exe", started: 2},
				12: {parent: 11, name: "cmd.exe", started: 3},
				13: {parent: 12, name: "node.exe", started: 4},
				14: {parent: 13, name: "matomezu.exe", started: 5},
			},
			entry: 13, want: 9,
		},
		{
			name: "npm で入れた AI の本体が node（Linux）",
			tree: tree{
				5:  {parent: 1, name: "bash", started: 1},
				10: {parent: 5, name: "node", started: 2},
				11: {parent: 10, name: "sh", started: 3},
				12: {parent: 11, name: "node", started: 4},
				13: {parent: 12, name: "matomezu", started: 5},
			},
			entry: 12, want: 10,
		},
		{
			name: "入口が名乗った pid が祖先でなければ、ただのプロセス",
			tree: tree{
				10: {parent: 1, name: "claude", started: 1},
				13: {parent: 10, name: "matomezu", started: 2},
			},
			entry: 999, want: 10,
		},
		{
			name: "開発の版を起動し直した（Windows では起動し直した側が親）",
			tree: tree{
				10: {parent: 0, name: "claude.exe", started: 1},
				11: {parent: 10, name: "matomezu.exe", started: 2},
				12: {parent: 11, name: "matomezu.exe", started: 3},
			},
			want: 10,
		},
		{
			name: "Windows の monitor: 親の鎖が途中で切れる",
			tree: tree{
				11: {parent: 30, name: "bash.exe", started: 2},
				12: {parent: 11, name: "bash.exe", started: 3},
				13: {parent: 12, name: "matomezu.exe", started: 4},
			},
			want: 0,
		},
		{
			name: "親の pid が後から起動した別のプロセスに使い回された",
			tree: tree{
				11: {parent: 10, name: "bash.exe", started: 5},
				10: {parent: 0, name: "notepad.exe", started: 9},
				12: {parent: 11, name: "matomezu.exe", started: 6},
			},
			want: 0,
		},
		{
			name: "根まで中継だけ",
			tree: tree{
				11: {parent: 1, name: "bash", started: 2},
				12: {parent: 11, name: "matomezu", started: 3},
			},
			want: 0,
		},
		{
			name: "知らない中継は AI のプログラムとみなす",
			tree: tree{
				10: {parent: 0, name: "claude.exe", started: 1},
				11: {parent: 10, name: "shim.exe", started: 2},
				12: {parent: 11, name: "matomezu.exe", started: 3},
			},
			want: 11,
		},
	} {
		self := 0
		for pid, p := range c.tree {
			if procName(p.name) == "matomezu" && (self == 0 || p.started > c.tree[self].started) {
				self = pid
			}
		}
		got, _ := findHost(self, c.tree.table, c.entry)
		if got != c.want {
			t.Errorf("%s: host = %d, want %d", c.name, got, c.want)
		}
	}
}

// OS から読む表で、自分の親が引ける（テストを走らせているプロセスは中継でなく、go test の親）
func TestOSProcTableReadsTheParent(t *testing.T) {
	me, ok := osProcTable(os.Getpid())
	if !ok {
		t.Fatal("cannot read this process")
	}
	if me.parent != os.Getppid() {
		t.Fatalf("parent = %d, want %d", me.parent, os.Getppid())
	}
	parent, ok := osProcTable(me.parent)
	if !ok || parent.started > me.started {
		t.Fatalf("parent = %+v (%v), me = %+v", parent, ok, me)
	}
}
