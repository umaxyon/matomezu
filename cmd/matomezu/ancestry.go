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
	"volta": true,
	// Volta の shim。macOS の名前（P_comm）は、shim の置き場の名前（matomezu）でなく、指す先の実行ファイルの名前
	"volta-shim": true,
	"matomezu":   true, // 開発の版を起動し直したときの、起動し直した側
}

// entryPIDEnv は、matomezu の npm の入口（node）が、自分のプロセス id を子の実行ファイルに伝える環境変数
const entryPIDEnv = "MATOMEZU_ENTRY_PID"

// maxAncestry は、たどる親の段の上限
const maxAncestry = 32

// procName は、比べるための名前（小文字、.exe を除いた物）
func procName(name string) string {
	return strings.TrimSuffix(strings.ToLower(name), ".exe")
}

// ancestor は、たどった親 1 つ（プロセス id と起動した時。起動した時で、同じ id の別のプロセスと見分ける）
type ancestor struct {
	pid     int
	started int64
}

// lineage は、プロセス self から親をたどり、中継（relayNames と、プロセス id が entry の npm の入口）を飛ばした最初のプロセス（AI のプログラム）までの親の列と、
// AI のプログラムの id と名前を返す。親が居ない・親が子より後に起動した（プロセス id が使い回された）・根に着いたときは、そこまでの列と、分からないとして 0 を返す
func lineage(self int, table procTable, entry int) ([]ancestor, int, string) {
	child, ok := table(self)
	if !ok {
		return nil, 0, ""
	}
	var line []ancestor
	for range maxAncestry {
		pid := child.parent
		if pid <= 1 {
			return line, 0, ""
		}
		p, ok := table(pid)
		if !ok || p.started > child.started {
			return line, 0, ""
		}
		line = append(line, ancestor{pid: pid, started: p.started})
		if pid != entry && !relayNames[procName(p.name)] {
			return line, pid, p.name
		}
		child = p
	}
	return line, 0, ""
}

// findHost は、プロセス self から親をたどった AI のプログラムの id と名前（分からなければ 0）
func findHost(self int, table procTable, entry int) (int, string) {
	_, pid, name := lineage(self, table, entry)
	return pid, name
}

// lineageAlive は、親の列 line のどれもが、まだ居るか（同じ id で、同じ時に起動した物か）。
// AI のプログラムが終わると、中継（シェルなど）も止められる。Windows では、止められた中継の子の子は残るので、列のどこかが居なくなったら終える目印にする
func lineageAlive(line []ancestor, table procTable) bool {
	for _, a := range line {
		p, ok := table(a.pid)
		if !ok || p.started != a.started {
			return false
		}
	}
	return true
}

// ancestorsAlive は、起動したときの親の列（AI のプログラムまでか、たどれる所まで）が、どれもまだ居る間 true を返す関数
func ancestorsAlive() func() bool {
	entry, _ := strconv.Atoi(os.Getenv(entryPIDEnv))
	line, _, _ := lineage(os.Getpid(), osProcTable, entry)
	return func() bool { return lineageAlive(line, osProcTable) }
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

// hostProcess は、AI のプログラムのプロセス id（分からなければ空）。送り先エッジを、フックや monitor が名指す AI のプログラムと合わせるのに使う
func hostProcess() string {
	pid, _ := hostProgram()
	return pid
}
