package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"

	"github.com/gofrs/flock"

	claudelaunch "github.com/umaxyon/matomezu/clients/claude-code/launch"
	codexlaunch "github.com/umaxyon/matomezu/clients/codex/launch"
)

type pluginCmd struct {
	Enable  pluginEnableCmd  `cmd:"" help:"Enable the installed matomezu plugin."`
	Disable pluginDisableCmd `cmd:"" help:"Disable the installed matomezu plugin."`
	Remove  pluginRemoveCmd  `cmd:"" help:"Remove the plugins and stop the server before uninstalling matomezu."`
}

type pluginTarget struct {
	AI string `arg:"" optional:"" help:"The AI client (all installed plugins when omitted)."`
}

type pluginEnableCmd struct{ pluginTarget }
type pluginDisableCmd struct{ pluginTarget }

func (c *pluginEnableCmd) Run() error {
	return withPluginLock(func() error { return c.change(true) })
}

func (c *pluginDisableCmd) Run() error {
	return withPluginLock(func() error { return c.change(false) })
}

// withPluginLock は、同じ保管庫からのプラグインの登録・更新・設定変更を順に行う。
func withPluginLock(run func() error) error {
	h, err := openHome()
	if err != nil {
		return err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	lock := flock.New(filepath.Join(h.Dir, "client-plugins.lock"))
	locked, err := lock.TryLockContext(ctx, 100*time.Millisecond)
	if err != nil {
		return fmt.Errorf("locking the matomezu plugin settings: %w", err)
	}
	if !locked {
		return fmt.Errorf("could not lock the matomezu plugin settings")
	}
	defer lock.Unlock()
	return run()
}

func (c pluginTarget) change(enabled bool) error {
	switch c.AI {
	case "", "claude", "claude-code", "codex":
	default:
		return fmt.Errorf("unknown AI client %q (claude or codex)", c.AI)
	}
	targets := []string{c.AI}
	if c.AI == "" {
		targets = []string{"claude", "codex"}
	}
	var failures []error
	for _, target := range targets {
		client := aiPluginFor(target)
		if err := client.changeEnabled(enabled, c.AI != ""); err != nil {
			failures = append(failures, fmt.Errorf("%s: %w", client.program, err))
		}
	}
	return errors.Join(failures...)
}

type aiPlugin struct {
	name, program, manifest                 string
	list, listMarketplaces, install, update []string
	status                                  func([]byte) (string, bool, error)
	marketplacePath                         func([]byte) (string, bool, error)
	setEnabled                              func(string, bool) error
}

func aiPluginFor(name string) aiPlugin {
	if name == "codex" {
		return aiPlugin{
			name: "codex", program: "codex", manifest: codexlaunch.ManifestDir,
			list: codexlaunch.ListPlugins, listMarketplaces: codexlaunch.ListMarketplaces,
			install: codexlaunch.InstallPlugin, update: codexlaunch.InstallPlugin,
			status: codexlaunch.PluginStatus, marketplacePath: codexlaunch.MarketplacePath,
			setEnabled: func(executable string, enabled bool) error {
				return codexlaunch.SetPluginEnabled(executable, enabled, os.Stderr)
			},
		}
	}
	return aiPlugin{
		name: "claude-code", program: "claude", manifest: claudelaunch.ManifestDir,
		list: claudelaunch.ListPlugins, listMarketplaces: claudelaunch.ListMarketplaces,
		install: claudelaunch.InstallPlugin, update: claudelaunch.UpdatePlugin,
		status: claudelaunch.PluginStatus, marketplacePath: claudelaunch.MarketplacePath,
		setEnabled: func(executable string, enabled bool) error {
			return runPluginCommand(executable, claudelaunch.SetEnabledArgs(enabled)...)
		},
	}
}

func (p aiPlugin) installed(executable string) (string, bool, error) {
	out, err := pluginOutput(executable, p.list...)
	if err != nil {
		return "", false, err
	}
	return p.status(out)
}

func (p aiPlugin) changeEnabled(enabled, required bool) error {
	executable, err := exec.LookPath(p.program)
	if err != nil {
		if !required {
			return nil
		}
		return err
	}
	installed, current, err := p.installed(executable)
	if err != nil {
		return err
	}
	if installed == "" {
		if !required {
			return nil
		}
		return fmt.Errorf("matomezu's plugin is not installed")
	}
	if current != enabled {
		if err := p.setEnabled(executable, enabled); err != nil {
			return err
		}
		_, current, err = p.installed(executable)
		if err != nil {
			return err
		}
		if current != enabled {
			return fmt.Errorf("the effective plugin setting did not change")
		}
	}
	state := "disabled"
	if enabled {
		state = "enabled"
	}
	fmt.Printf("%s: matomezu plugin %s. Open a new session to apply the change.\n", p.program, state)
	return nil
}

func (p aiPlugin) prepare(executable string) error {
	installed, enabled, err := p.installed(executable)
	if err != nil {
		return err
	}
	if installed != "" && !enabled {
		return fmt.Errorf("matomezu's plugin is disabled for %s. Run matomezu plugin enable %s", p.program, p.program)
	}

	dir, err := pluginPath(p.name, os.Getenv(packageDirEnv), selfExecutable())
	if err != nil {
		return err
	}
	bundled, err := pluginVersion(filepath.Join(dir, p.manifest, "plugin.json"))
	if err != nil {
		return err
	}
	if installed == bundled {
		return nil
	}

	out, err := pluginOutput(executable, p.listMarketplaces...)
	if err != nil {
		return err
	}
	source, found, err := p.marketplacePath(out)
	if err != nil {
		return err
	}
	if found && !sameFile(source, dir) {
		return fmt.Errorf("%s has a matomezu marketplace registered from another source. To switch to the bundled plugin, remove that registration first", p.program)
	}
	args := p.update
	if installed == "" {
		fmt.Fprintf(os.Stderr, "Installing the bundled matomezu plugin in your %s settings.\n", p.program)
		args = p.install
	} else {
		fmt.Fprintf(os.Stderr, "Updating the matomezu plugin for %s from %s to %s.\n", p.program, installed, bundled)
	}
	if !found {
		if err := runPluginCommand(executable, "plugin", "marketplace", "add", dir); err != nil {
			return err
		}
	}
	if err := runPluginCommand(executable, args...); err != nil {
		return err
	}
	got, enabled, err := p.installed(executable)
	if err != nil {
		return err
	}
	if got != bundled || !enabled {
		return fmt.Errorf("%s did not report the bundled plugin version %s as installed and enabled", p.program, bundled)
	}
	return nil
}

func pluginVersion(path string) (string, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return "", err
	}
	var manifest struct {
		Version string `json:"version"`
	}
	if err := json.Unmarshal(data, &manifest); err != nil {
		return "", fmt.Errorf("%s: %w", path, err)
	}
	if manifest.Version == "" {
		return "", fmt.Errorf("%s does not specify a plugin version", path)
	}
	return manifest.Version, nil
}

func pluginOutput(executable string, args ...string) ([]byte, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 45*time.Second)
	defer cancel()
	cmd := exec.CommandContext(ctx, executable, args...)
	cmd.Stderr = os.Stderr
	out, err := cmd.Output()
	if err != nil {
		return nil, fmt.Errorf("%s %s: %w", filepath.Base(executable), strings.Join(args, " "), err)
	}
	return out, nil
}

func runPluginCommand(executable string, args ...string) error {
	ctx, cancel := context.WithTimeout(context.Background(), 45*time.Second)
	defer cancel()
	cmd := exec.CommandContext(ctx, executable, args...)
	cmd.Stdout, cmd.Stderr = os.Stderr, os.Stderr
	if err := cmd.Run(); err != nil {
		return fmt.Errorf("%s %s: %w", filepath.Base(executable), strings.Join(args, " "), err)
	}
	return nil
}
