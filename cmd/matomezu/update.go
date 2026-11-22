package main

// 版を上げる（matomezu update）: 入れ方（npm・Volta・pnpm・bun）を本体のパッケージのフォルダから見分けて、その道具で新しい版を入れ、
// AI に入れたプラグインを同じ版にし、古い常駐を新しい版で立て直す。見分けられない入れ方では、打つコマンドを見せて止まる

import (
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"strings"

	opencodelaunch "github.com/umaxyon/matomezu/clients/opencode/launch"
)

type updateCmd struct{}

// installer は、本体を入れた道具と、新しい版を入れるコマンド
type installer struct {
	name string
	cmd  []string
}

// installerFor は、本体のパッケージのフォルダ dir から、入れた道具を見分ける。見分けられなければ ok が偽
func installerFor(dir string) (installer, bool) {
	p := strings.ToLower(strings.ReplaceAll(dir, `\`, "/"))
	switch {
	case p == "":
		return installer{}, false
	case strings.Contains(p, "/volta/tools/image/packages/") || strings.Contains(p, "/.volta/tools/image/packages/"):
		// Volta は npm i -g を受けて自分で入れる
		return installer{"Volta", []string{"npm", "install", "-g", "matomezu@latest"}}, true
	case strings.Contains(p, "/pnpm/") || strings.Contains(p, "/.pnpm/"):
		return installer{"pnpm", []string{"pnpm", "add", "-g", "matomezu@latest"}}, true
	case strings.Contains(p, "/.bun/install/global/"):
		return installer{"bun", []string{"bun", "add", "-g", "matomezu@latest"}}, true
	case strings.HasSuffix(p, "/node_modules/matomezu"):
		return installer{"npm", []string{"npm", "install", "-g", "matomezu@latest"}}, true
	}
	return installer{}, false
}

// updater は、版を上げるのに使う、OS への口（テストで差し替える）
type updater struct {
	out      io.Writer
	lookPath func(string) (string, error)
	run      func(name string, args ...string) error
	output   func(name string, args ...string) (string, error)
	// pluginInstalled は、AI のプログラム ai（claude・codex）に matomezu のプラグインが入っているか
	pluginInstalled func(ai, executable string) bool
	// opencodeHasPlugin は、opencode の設定に matomezu のプラグインがあるか
	opencodeHasPlugin func() bool
	// restartServer は、古い常駐を新しい版で立て直す（立っていなければ何もしない）
	restartServer func() error
}

func (c *updateCmd) Run() error {
	if version == devVersion {
		return errors.New("this matomezu is a development build: update it from its repository")
	}
	u := updater{
		out:      os.Stdout,
		lookPath: exec.LookPath,
		run: func(name string, args ...string) error {
			cmd := exec.Command(name, args...)
			cmd.Stdout, cmd.Stderr = os.Stdout, os.Stderr
			return cmd.Run()
		},
		output: func(name string, args ...string) (string, error) {
			cmd := exec.Command(name, args...)
			cmd.Stderr = os.Stderr
			b, err := cmd.Output()
			return strings.TrimSpace(string(b)), err
		},
		pluginInstalled: func(ai, executable string) bool {
			v, _, err := aiPluginFor(ai).installed(executable)
			return err == nil && v != ""
		},
		opencodeHasPlugin: opencodeHasPlugin,
		restartServer:     restartOlderServer,
	}
	return u.update(os.Getenv(packageDirEnv), version)
}

func (u updater) update(packageDir, from string) error {
	in, ok := installerFor(packageDir)
	if !ok {
		fmt.Fprintln(u.out, "matomezu could not tell how it was installed. Update it with the tool you installed it with, for example:")
		fmt.Fprintln(u.out, "  npm install -g matomezu@latest")
		return errors.New("not updated")
	}
	fmt.Fprintf(u.out, "Updating matomezu with %s: %s\n", in.name, strings.Join(in.cmd, " "))
	if err := u.run(in.cmd[0], in.cmd[1:]...); err != nil {
		return fmt.Errorf("%s: %w", strings.Join(in.cmd, " "), err)
	}
	// 新しい版の入口を 1 度動かす（版を聞き、写した物と今入っている版の印を入口が書く）
	self, err := u.lookPath("matomezu")
	if err != nil {
		return fmt.Errorf("matomezu is not found on PATH after updating: %w", err)
	}
	to, err := u.output(self, "version")
	if err != nil {
		return fmt.Errorf("matomezu version: %w", err)
	}
	var failures []error
	for _, ai := range []struct{ name, program string }{{"claude", "claude"}, {"codex", "codex"}} {
		executable, err := u.lookPath(ai.program)
		if err != nil || !u.pluginInstalled(ai.name, executable) {
			continue
		}
		if err := u.run(self, "plugin", "install", ai.name); err != nil {
			failures = append(failures, fmt.Errorf("the plugin for %s: %w", ai.program, err))
		}
	}
	if _, err := u.lookPath("opencode"); err == nil && u.opencodeHasPlugin() {
		if err := u.run("opencode", "plugin", "add", opencodelaunch.Package+"@"+to); err != nil {
			failures = append(failures, fmt.Errorf("the plugin for opencode: %w", err))
		}
	}
	if err := u.restartServer(); err != nil {
		failures = append(failures, fmt.Errorf("the server: %w", err))
	}
	if from == to {
		fmt.Fprintf(u.out, "matomezu %s is the newest.\n", to)
	} else {
		fmt.Fprintf(u.out, "matomezu is updated from %s to %s. AI conversations that are open keep the old version until you restart them.\n", from, to)
	}
	return errors.Join(failures...)
}

// restartOlderServer は、立っている常駐が今入っている版より古ければ、止めて今の版で立て直す（ensure が見る）
func restartOlderServer() error {
	h, err := openHome()
	if err != nil {
		return err
	}
	s, err := running(h)
	if err != nil || s == nil {
		return err
	}
	_, err = ensure(h, serverFlags{})
	return err
}

// opencodeHasPlugin は、opencode の利用者の設定（~/.config/opencode/opencode.json か .jsonc）に matomezu のプラグインがあるか
func opencodeHasPlugin() bool {
	dir := os.Getenv("XDG_CONFIG_HOME")
	if dir == "" {
		h, err := os.UserHomeDir()
		if err != nil {
			return false
		}
		dir = filepath.Join(h, ".config")
	}
	for _, name := range []string{"opencode.json", "opencode.jsonc"} {
		if b, err := os.ReadFile(filepath.Join(dir, "opencode", name)); err == nil && strings.Contains(string(b), opencodelaunch.Package) {
			return true
		}
	}
	return false
}
