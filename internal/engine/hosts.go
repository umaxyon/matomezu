package engine

import (
	"encoding/json"
	"fmt"
)

// HostSettings は、ホストどうしのつなぎの利用者の設定: ほかのホストとつなぐか（Connect）と、ホスト名（Name。無ければ空）
type HostSettings struct {
	Connect bool   `json:"connect"`
	Name    string `json:"name"`
}

// HostSettingsOf は、利用者の設定 settings から、ホストどうしのつなぎの設定を読む
func (e *Engine) HostSettingsOf(settings json.RawMessage) (out HostSettings, err error) {
	if len(settings) == 0 {
		settings = json.RawMessage("null")
	}
	e.mu.Lock()
	defer e.mu.Unlock()
	defer func() {
		if r := recover(); r != nil {
			err = fmt.Errorf("engine: %v", r)
		}
	}()
	err = json.Unmarshal([]byte(e.hostSettings(string(settings))), &out)
	return out, err
}
