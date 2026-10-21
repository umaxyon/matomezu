//go:build windows

package main

import "syscall"

const (
	createNewProcessGroup = 0x00000200
	detachedProcess       = 0x00000008
)

// detached は、立てた常駐を CLI のコンソールから切り離す（CLI が終わっても止まらない）
func detached() *syscall.SysProcAttr {
	return &syscall.SysProcAttr{CreationFlags: createNewProcessGroup | detachedProcess, HideWindow: true}
}
