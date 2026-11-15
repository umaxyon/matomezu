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

// ProcessSpaceEnded は、名乗った印 said（ProcessSpace の値）の範囲にあったプロセスが、今の印 now の範囲から見て終わっているか。
// 同じ印ならプロセスが居るかを見る（居なければ終わっている）。印の起動ごとの識別子（Linux の boot_id）が変わっていれば、機械が起動し直されているので、居たプロセスは全部終わっている。
// それ以外（名前空間だけが違う・ほかの OS の印が違う）は、プロセス id を確かめられないので、終わったとは言わない
func ProcessSpaceEnded(said, now, pid string, alive func(string) bool) bool {
	if said == now {
		return !alive(pid)
	}
	saidBoot, saidOK := bootOf(said)
	nowBoot, nowOK := bootOf(now)
	return saidOK && nowOK && saidBoot != nowBoot
}

// bootOf は、Linux の印（linux|名前空間|boot_id）の起動ごとの識別子（空なら取れない）
func bootOf(space string) (string, bool) {
	parts := strings.Split(space, "|")
	if len(parts) != 3 || parts[0] != "linux" || parts[2] == "" {
		return "", false
	}
	return parts[2], true
}
