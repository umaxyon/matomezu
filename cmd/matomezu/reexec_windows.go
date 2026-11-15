package main

import (
	"errors"
	"os"
	"os/exec"
)

// reexec は、実行ファイル target を、同じ引数と環境で子として起動し、標準入出力をつないで終わりを待ち、その終わりの値で終える（起動できなければ戻る）。
// Windows には、このプロセスのまま起動し直す手が無い
func reexec(target string) {
	cmd := exec.Command(target, os.Args[1:]...)
	cmd.Stdin, cmd.Stdout, cmd.Stderr = os.Stdin, os.Stdout, os.Stderr
	if err := cmd.Start(); err != nil {
		return
	}
	err := cmd.Wait()
	var exit *exec.ExitError
	if errors.As(err, &exit) {
		os.Exit(exit.ExitCode())
	}
	if err != nil {
		os.Exit(1)
	}
	os.Exit(0)
}
