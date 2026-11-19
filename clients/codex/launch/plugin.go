package launch

import (
	"bufio"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os/exec"
	"time"
)

const PluginID = "matomezu@matomezu"
const ManifestDir = ".codex-plugin"

var ListPlugins = []string{"plugin", "list", "--marketplace", "matomezu", "--json"}
var ListMarketplaces = []string{"plugin", "marketplace", "list", "--json"}
var InstallPlugin = []string{"plugin", "add", PluginID}

// PluginStatus は、現在の場所で見える matomezu の版と有効・無効を CLI の一覧から読む。
func PluginStatus(data []byte) (version string, enabled bool, err error) {
	var list struct {
		Installed []struct {
			ID      string `json:"pluginId"`
			Version string `json:"version"`
			Enabled bool   `json:"enabled"`
		} `json:"installed"`
	}
	if err := json.Unmarshal(data, &list); err != nil {
		return "", false, err
	}
	for _, plugin := range list.Installed {
		if plugin.ID == PluginID {
			return plugin.Version, plugin.Enabled, nil
		}
	}
	return "", false, nil
}

// MarketplacePath は、名前 matomezu が登録済みかと、登録先のフォルダを CLI の一覧から読む。
func MarketplacePath(data []byte) (path string, found bool, err error) {
	var list struct {
		Marketplaces []struct {
			Name   string `json:"name"`
			Source struct {
				Type string `json:"sourceType"`
				Path string `json:"source"`
			} `json:"marketplaceSource"`
		} `json:"marketplaces"`
	}
	if err := json.Unmarshal(data, &list); err != nil {
		return "", false, err
	}
	for _, marketplace := range list.Marketplaces {
		if marketplace.Name == "matomezu" {
			if marketplace.Source.Type == "local" {
				return marketplace.Source.Path, true, nil
			}
			return "", true, nil
		}
	}
	return "", false, nil
}

// SetPluginEnabled は、Codex にプラグインの有効・無効を利用者の設定へ書かせる。
func SetPluginEnabled(executable string, enabled bool, diagnostics io.Writer) error {
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	cmd := exec.CommandContext(ctx, executable, "app-server", "--listen", "stdio://")
	cmd.Stderr = diagnostics
	in, err := cmd.StdinPipe()
	if err != nil {
		return err
	}
	out, err := cmd.StdoutPipe()
	if err != nil {
		in.Close()
		return err
	}
	if err := cmd.Start(); err != nil {
		return err
	}
	defer func() {
		in.Close()
		cancel()
		cmd.Wait()
	}()
	write := json.NewEncoder(in)
	read := bufio.NewReader(out)
	call := func(id int, method string, params any) error {
		if err := write.Encode(map[string]any{"id": id, "method": method, "params": params}); err != nil {
			return err
		}
		for {
			line, err := read.ReadBytes('\n')
			if err != nil {
				return fmt.Errorf("reading Codex's %s response: %w", method, err)
			}
			var response struct {
				ID    int `json:"id"`
				Error *struct {
					Message string `json:"message"`
				} `json:"error"`
			}
			if err := json.Unmarshal(line, &response); err != nil {
				return err
			}
			if response.ID != id {
				continue
			}
			if response.Error != nil {
				return errors.New(response.Error.Message)
			}
			return nil
		}
	}
	if err := call(1, "initialize", map[string]any{"clientInfo": map[string]string{"name": "matomezu", "version": "1"}}); err != nil {
		return err
	}
	if err := write.Encode(map[string]string{"method": "initialized"}); err != nil {
		return err
	}
	return call(2, "config/value/write", map[string]any{
		"keyPath":       "plugins." + PluginID + ".enabled",
		"value":         enabled,
		"mergeStrategy": "upsert",
	})
}
