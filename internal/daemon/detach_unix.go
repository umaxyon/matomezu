//go:build !windows

package daemon

import (
	"os/exec"
	"syscall"
)

// 呼び出したシェルやエージェントが終わっても止まらないよう、新しいセッションで起動する
func detach(cmd *exec.Cmd) {
	cmd.SysProcAttr = &syscall.SysProcAttr{Setsid: true}
}
