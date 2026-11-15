//go:build !windows

package main

import "os"

// parentAlive は、起動したときの親が居る間 true を返す関数（親が居なくなると、親は 1 などの別の id に替わる）
func parentAlive() func() bool {
	first := os.Getppid()
	return func() bool { return os.Getppid() == first }
}
