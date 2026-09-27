//go:build windows

package daemon

import (
	"os/exec"
	"syscall"
)

const detachedProcess = 0x00000008

// 呼び出したコンソールが閉じても止まらないよう、コンソールから切り離して起動する
func detach(cmd *exec.Cmd) {
	cmd.SysProcAttr = &syscall.SysProcAttr{
		CreationFlags: detachedProcess | syscall.CREATE_NEW_PROCESS_GROUP,
		HideWindow:    true,
	}
}
