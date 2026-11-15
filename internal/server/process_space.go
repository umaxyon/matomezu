// AI のプログラムのプロセスについて、同じ機械の同じ名前空間なら確かめられること: 居るか（ProcessAlive。process_unix.go・process_windows.go）と、プロセス id が通じる範囲の印（ProcessSpace）。
package server

import (
	"os"
	"runtime"
	"strings"
)

// ProcessSpace は、このプロセスのプロセス id が通じる範囲の印。常駐と MCP が同じ印のときだけ、MCP が伝えたプロセス id を常駐が確かめられる。
// Linux はプロセス名前空間の識別子と起動ごとの識別子（コンテナや WSL の別のディストリでは変わる）、ほかの OS は OS 名とホスト名
func ProcessSpace() string {
	host, _ := os.Hostname()
	if runtime.GOOS == "linux" {
		ns, _ := os.Readlink("/proc/self/ns/pid")
		boot, _ := os.ReadFile("/proc/sys/kernel/random/boot_id")
		return "linux|" + ns + "|" + strings.TrimSpace(string(boot))
	}
	return runtime.GOOS + "|" + host
}
