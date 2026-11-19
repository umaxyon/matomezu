//go:build !windows

package main

import (
	"os"
	"syscall"
)

// runAI は、同じ端末・環境とプロセスで AI の CLI を起動する。
func runAI(executable string, args []string) error {
	return syscall.Exec(executable, append([]string{executable}, args...), os.Environ())
}
