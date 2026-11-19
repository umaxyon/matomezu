package main

import (
	"errors"
	"os"
	"os/exec"
)

// runAI は、AI の CLI を同じ端末・環境につないで終了の値を引き継ぐ。
func runAI(executable string, args []string) error {
	cmd := exec.Command(executable, args...)
	cmd.Stdin, cmd.Stdout, cmd.Stderr = os.Stdin, os.Stdout, os.Stderr
	err := cmd.Run()
	var exit *exec.ExitError
	if errors.As(err, &exit) {
		os.Exit(exit.ExitCode())
	}
	return err
}
