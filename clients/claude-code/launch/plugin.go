package launch

import "encoding/json"

const PluginID = "matomezu@matomezu"
const ManifestDir = ".claude-plugin"

var ListPlugins = []string{"plugin", "list", "--json"}
var ListMarketplaces = []string{"plugin", "marketplace", "list", "--json"}
var InstallPlugin = []string{"plugin", "install", PluginID, "--scope", "user"}
var UpdatePlugin = []string{"plugin", "update", PluginID}

// SetEnabledArgs は、導入先の範囲を Claude Code に選ばせ、有効・無効を切り替える引数。
func SetEnabledArgs(enabled bool) []string {
	action := "disable"
	if enabled {
		action = "enable"
	}
	return []string{"plugin", action, PluginID}
}

// PluginStatus は、現在の場所で見える matomezu の版と有効・無効を CLI の一覧から読む。
func PluginStatus(data []byte) (version string, enabled bool, err error) {
	var plugins []struct {
		ID      string `json:"id"`
		Version string `json:"version"`
		Enabled bool   `json:"enabled"`
	}
	if err := json.Unmarshal(data, &plugins); err != nil {
		return "", false, err
	}
	for _, plugin := range plugins {
		if plugin.ID == PluginID {
			return plugin.Version, plugin.Enabled, nil
		}
	}
	return "", false, nil
}

// MarketplacePath は、名前 matomezu が登録済みかと、登録先のフォルダを CLI の一覧から読む。
func MarketplacePath(data []byte) (path string, found bool, err error) {
	var marketplaces []struct {
		Name   string `json:"name"`
		Source string `json:"source"`
		Path   string `json:"path"`
	}
	if err := json.Unmarshal(data, &marketplaces); err != nil {
		return "", false, err
	}
	for _, marketplace := range marketplaces {
		if marketplace.Name == "matomezu" {
			if marketplace.Source == "directory" {
				return marketplace.Path, true, nil
			}
			return "", true, nil
		}
	}
	return "", false, nil
}
