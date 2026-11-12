//go:build !windows

package main

import (
	"strconv"
	"syscall"
)

// processAlive は、プロセス id pid のプロセスがまだ居るか（数でなければ居るとみなす）
func processAlive(pid string) bool {
	n, err := strconv.Atoi(pid)
	if err != nil || n <= 0 {
		return true
	}
	err = syscall.Kill(n, 0)
	return err == nil || err == syscall.EPERM
}
