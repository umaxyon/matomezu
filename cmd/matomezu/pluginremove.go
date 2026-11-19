package main

// プラグインを外す（matomezu plugin remove）: npm で matomezu を消すと、AI のプログラムに入れたプラグインと置き場所の登録が残る（npm は消すときにパッケージの処理を走らせない）。
// 消す前にこれを打ってもらい、常駐を止め、AI のプログラムごとの CLI でプラグインを外す。matomezu 本体と保管庫フォルダ（利用者のデータ）は消さない

import (
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"strings"

	claudelaunch "github.com/umaxyon/matomezu/clients/claude-code/launch"
	codexlaunch "github.com/umaxyon/matomezu/clients/codex/launch"
	opencodelaunch "github.com/umaxyon/matomezu/clients/opencode/launch"
)

type pluginRemoveCmd struct {
	AI []string `arg:"" optional:"" help:"The AI programs to remove the plugin from: claude, codex or opencode (all of them that are found when omitted)."`
}

// removers は、AI の名前と、そのプラグインを外すコマンド（並びは外す順）
var removers = []struct {
	ai   string
	cmds [][]string
}{
	{"claude-code", claudelaunch.Remove},
	{"codex", codexlaunch.Remove},
	{"opencode", opencodelaunch.Remove},
}

// remover は、プラグインを外すのに使う、OS への口（テストで差し替える）
type remover struct {
	out      io.Writer
	lookPath func(string) (string, error)
	run      func(name string, args ...string) error
}

// Run は、常駐を止めてから、AI ごとにプラグインを外し、残りの手順を出す
func (c *pluginRemoveCmd) Run() error {
	return withPluginLock(c.removeInstalled)
}

func (c *pluginRemoveCmd) removeInstalled() error {
	if err := (&stopCmd{}).Run(); err != nil {
		fmt.Printf("The matomezu server could not be stopped: %v\n", err)
	}
	r := remover{out: os.Stdout, lookPath: exec.LookPath, run: func(name string, args ...string) error {
		cmd := exec.Command(name, args...)
		cmd.Stdout, cmd.Stderr = os.Stdout, os.Stderr
		return cmd.Run()
	}}
	err := r.remove(c.AI)
	if h, herr := openHome(); herr == nil {
		fmt.Printf("Your books stay in %s. Delete the folder yourself if you no longer need them.\n", h.Dir)
	}
	fmt.Println("Close Claude Code, Codex and opencode, then remove matomezu: npm uninstall -g matomezu")
	return err
}

// remove は、名前 names の AI（空なら全部）のプラグインを外す。AI のプログラムが PATH に無い AI は飛ばし、外すのに失敗しても残りを続ける。
// 入れていないプラグインを外すと、AI の CLI によっては失敗で返る（入れたかは CLI ごとに見分け方が違うので、確かめずに打つ）
func (r remover) remove(names []string) error {
	want := map[string]bool{}
	for _, n := range names {
		if n == "claude" {
			n = "claude-code"
		}
		if !knownRemover(n) {
			return fmt.Errorf("unknown AI program %q (claude-code, codex or opencode)", n)
		}
		want[n] = true
	}
	var failed []string
	for _, rm := range removers {
		if len(want) > 0 && !want[rm.ai] {
			continue
		}
		prog := rm.cmds[0][0]
		if _, err := r.lookPath(prog); err != nil {
			fmt.Fprintf(r.out, "%s: skipped (%s was not found)\n", rm.ai, prog)
			continue
		}
		for _, c := range rm.cmds {
			fmt.Fprintf(r.out, "%s: %s\n", rm.ai, strings.Join(c, " "))
			if err := r.run(c[0], c[1:]...); err != nil {
				fmt.Fprintf(r.out, "%s: failed: %v\n", rm.ai, err)
				failed = append(failed, strings.Join(c, " "))
			}
		}
	}
	if len(failed) > 0 {
		return errors.New("these commands failed (fine if matomezu's plugin was not added to that AI program): " + strings.Join(failed, "; "))
	}
	return nil
}

// knownRemover は、name がプラグインを外せる AI の名前か
func knownRemover(name string) bool {
	for _, rm := range removers {
		if rm.ai == name {
			return true
		}
	}
	return false
}
