package main

import (
	"errors"
	"os"
	"os/exec"
	"os/signal"
)

// runAI は、AI の CLI を同じ端末・環境につないで終了の値を引き継ぐ。
func runAI(executable string, args []string) error {
	// 親の中断は受け流し、コンソールの中断は子にも届くようにする。
	interrupt := make(chan os.Signal, 1)
	signal.Notify(interrupt, os.Interrupt)
	defer signal.Stop(interrupt)
	cmd := exec.Command(executable, args...)
	cmd.Stdin, cmd.Stdout, cmd.Stderr = os.Stdin, os.Stdout, os.Stderr
	err := cmd.Run()
	var exit *exec.ExitError
	if errors.As(err, &exit) {
		os.Exit(exit.ExitCode())
	}
	return err
}
