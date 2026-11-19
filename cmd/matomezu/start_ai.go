package main

import (
	"fmt"
	"os"
	"os/exec"
	"strings"
)

type startAICmd struct {
	AI   string   `arg:"" enum:"codex,claude,claude-code" help:"The AI client: codex or claude."`
	Args []string `arg:"" optional:"" passthrough:"" help:"Arguments for the AI client (after --)."`
}

// legacyStart は、常駐だけを起動する書式を見分け、移行先を案内できるようにする。
func legacyStart(args []string) bool {
	if len(args) == 0 || args[0] != "start" {
		return false
	}
	if len(args) == 1 {
		return true
	}
	switch flag, _, _ := strings.Cut(args[1], "="); flag {
	case "--addr", "--web", "--plugin":
		return true
	}
	return false
}

const startPrompt = "Use matomezu to request to join from this conversation. After requesting to join, ask me to approve the request in matomezu. Once approved, check the current ticket and any handoff for the workroom."

func (c *startAICmd) Run() error {
	client := aiPluginFor(c.AI)
	executable, err := exec.LookPath(client.program)
	if err != nil {
		return fmt.Errorf("%s was not found on PATH: %w", client.program, err)
	}
	if err := withPluginLock(func() error { return client.prepare(executable) }); err != nil {
		return err
	}
	h, err := openHome()
	if err != nil {
		return err
	}
	if _, err := ensure(h, serverFlags{Addr: DefaultAddr}); err != nil {
		return err
	}
	fmt.Fprintln(os.Stderr, "To open the approval screen, run matomezu server start --open.")
	// -- でプロンプトを CLI のオプションと区別する。
	return runAI(executable, c.launchArgs())
}

// launchArgs は、matomezu 側の区切りを外して、AI の引数の後ろに初回プロンプトを渡す。
func (c startAICmd) launchArgs() []string {
	args := c.Args
	if len(args) > 0 && args[0] == "--" {
		args = args[1:]
	}
	return append(append([]string{}, args...), "--", startPrompt)
}
