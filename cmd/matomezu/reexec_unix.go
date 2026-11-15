//go:build !windows

package main

import (
	"os"
	"syscall"
)

// reexec は、実行ファイル target を、同じ引数と環境で、このプロセスのまま起動し直す（できなければ戻る）
func reexec(target string) {
	_ = syscall.Exec(target, append([]string{target}, os.Args[1:]...), os.Environ())
}
