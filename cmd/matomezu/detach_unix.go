//go:build !windows

package main

import "syscall"

// detached は、立てた常駐を CLI の端末から切り離す（CLI が終わっても止まらない）
func detached() *syscall.SysProcAttr {
	return &syscall.SysProcAttr{Setsid: true}
}
