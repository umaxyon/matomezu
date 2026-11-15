package main

// AI のプログラムを親のプロセスからたどる: matomezu は AI のプログラム（Claude Code など）から、シェル（Windows の cmd・PowerShell、Git の bash）や
// node の版を切り替える中継（volta）、npm の入口の node を挟んで起動される。中継を飛ばして、最初に当たった中継でないプロセスを AI のプログラムとみなす。
// node は名前では飛ばさない（npm で入れた AI のプログラムは node で動く）。飛ばすのは、matomezu の npm の入口が entryPIDEnv で名乗った node だけ。

import (
	"os"
	"strconv"
	"strings"
)

// procInfo は、プロセス 1 つの、たどるのに使う所
type procInfo struct {
	parent  int    // 親のプロセス id（無ければ 0）
	name    string // 実行ファイルの名前（Linux は comm、Windows は exe の名前）
	started int64  // 起動した時の、OS ごとの比べられる数（同じ OS の中で、先に起動した方が小さい）
}

// procTable は、プロセス id から procInfo を引く口（居なければ false）
type procTable func(pid int) (procInfo, bool)

// relayNames は、AI のプログラムと matomezu の間に挟まる中継の名前（小文字、.exe を除いた物）
var relayNames = map[string]bool{
	"sh": true, "bash": true, "dash": true, "zsh": true,
	"cmd": true, "powershell": true, "pwsh": true,
	"volta":    true,
	"matomezu": true, // 開発の版を起動し直したときの、起動し直した側
}

// entryPIDEnv は、matomezu の npm の入口（node）が、自分のプロセス id を子の実行ファイルに伝える環境変数
const entryPIDEnv = "MATOMEZU_ENTRY_PID"

// maxAncestry は、たどる親の段の上限
const maxAncestry = 32

// procName は、比べるための名前（小文字、.exe を除いた物）
func procName(name string) string {
	return strings.TrimSuffix(strings.ToLower(name), ".exe")
}

// findHost は、プロセス self から親をたどり、中継（relayNames と、プロセス id が entry の npm の入口）を飛ばした最初のプロセスの id と名前を返す。
// 親が居ない・親が子より後に起動した（プロセス id が使い回された）・根に着いたときは、分からないとして 0 を返す
func findHost(self int, table procTable, entry int) (int, string) {
	child, ok := table(self)
	if !ok {
		return 0, ""
	}
	for range maxAncestry {
		pid := child.parent
		if pid <= 1 {
			return 0, ""
		}
		p, ok := table(pid)
		if !ok || p.started > child.started {
			return 0, ""
		}
		if pid != entry && !relayNames[procName(p.name)] {
			return pid, p.name
		}
		child = p
	}
	return 0, ""
}

// hostProgram は、この matomezu を起動した AI のプログラムのプロセス id と名前（分からなければ空）
func hostProgram() (string, string) {
	entry, _ := strconv.Atoi(os.Getenv(entryPIDEnv))
	pid, name := findHost(os.Getpid(), osProcTable, entry)
	if pid == 0 {
		return "", ""
	}
	return strconv.Itoa(pid), name
}

// hostProcess は、AI のプログラムのプロセス id（分からなければ空）。起こす知らせの宛て先を、フックや monitor が名指す AI のプログラムと合わせるのに使う
func hostProcess() string {
	pid, _ := hostProgram()
	return pid
}
