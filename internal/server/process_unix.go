//go:build !windows

package server

import (
	"strconv"
	"syscall"
)

// ProcessAlive は、プロセス id pid のプロセスがまだ居るか（数でなければ居るとみなす）
func ProcessAlive(pid string) bool {
	n, err := strconv.Atoi(pid)
	if err != nil || n <= 0 {
		return true
	}
	err = syscall.Kill(n, 0)
	return err == nil || err == syscall.EPERM
}
