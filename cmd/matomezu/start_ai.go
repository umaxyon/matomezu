package main

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"

	"github.com/umaxyon/matomezu/internal/home"
)

type startAICmd struct {
	AI   string   `arg:"" enum:"codex,claude,claude-code" help:"The AI client: codex or claude."`
	Args []string `arg:"" optional:"" passthrough:"" help:"Arguments for the AI client (after --). With arguments, pass them through without a join prompt."`
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
	case "--addr", "--web", "--plugin", "--open":
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
	if err := startServerForAI(client.devRoot()); err != nil {
		return err
	}
	return runAI(executable, c.launchArgs())
}

// startServerForAI は、MCP がつなぐ保管庫の常駐を立て、画面の開き方を知らせる。
func startServerForAI(root string) error {
	dir, err := home.Dir()
	if err != nil {
		return err
	}
	flags := serverFlags{Addr: DefaultAddr}
	if root != "" {
		dir = filepath.Join(root, devHomeDir)
		flags = devServerFlags(root)
	}
	h, err := home.Open(dir)
	if err != nil {
		return err
	}
	if _, err := ensure(h, flags); err != nil {
		return err
	}
	if root != "" {
		fmt.Fprintf(os.Stderr, "For the approval screen, set MATOMEZU_HOME to %s and run matomezu server start --open.\n", h.Dir)
	} else {
		fmt.Fprintln(os.Stderr, "To open the approval screen, run matomezu server start --open.")
	}
	return nil
}

// launchArgs は、利用者の引数をそのまま渡し、引数が無いときだけ参加を頼む。
func (c startAICmd) launchArgs() []string {
	args := c.Args
	if len(args) > 0 && args[0] == "--" {
		args = args[1:]
	}
	if len(args) == 0 {
		return []string{"--", startPrompt}
	}
	return args
}
