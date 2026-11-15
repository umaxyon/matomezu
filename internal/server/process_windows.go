//go:build windows

package server

import (
	"strconv"
	"syscall"
)

const processQueryLimitedInformation = 0x1000

// ProcessAlive は、プロセス id pid のプロセスがまだ居るか（数でなければ居るとみなす）
func ProcessAlive(pid string) bool {
	n, err := strconv.Atoi(pid)
	if err != nil || n <= 0 {
		return true
	}
	h, err := syscall.OpenProcess(processQueryLimitedInformation, false, uint32(n))
	if err != nil {
		return false
	}
	defer syscall.CloseHandle(h)
	var code uint32
	if syscall.GetExitCodeProcess(h, &code) != nil {
		return true
	}
	return code == 259 // STILL_ACTIVE
}
