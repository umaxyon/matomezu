package main

import "golang.org/x/sys/unix"

// osProcTable は、sysctl（kern.proc.pid）から、親・名前・起動した時（マイクロ秒）を読む
func osProcTable(pid int) (procInfo, bool) {
	k, err := unix.SysctlKinfoProc("kern.proc.pid", pid)
	if err != nil || k.Proc.P_pid != int32(pid) {
		return procInfo{}, false
	}
	t := k.Proc.P_starttime
	name := unix.ByteSliceToString(k.Proc.P_comm[:])
	return procInfo{parent: int(k.Eproc.Ppid), name: name, started: t.Sec*1_000_000 + int64(t.Usec)}, true
}
