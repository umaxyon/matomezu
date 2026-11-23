package engine

import (
	"encoding/json"
	"fmt"
)

// HostSettings は、ホストどうしのつなぎの利用者の設定: ほかのホストとつなぐか（Connect）・ホスト名（Name。無ければ空）・利用者名（UserName。無ければ空）
type HostSettings struct {
	Connect  bool   `json:"connect"`
	Name     string `json:"name"`
	UserName string `json:"userName"`
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

// HostActions は、ほかのホストに応じて常駐が利用者として行うアクションの、役（core/hosts.ts の HOST_ROLES）ごとの id（名乗る物の無い役は入らない）
type HostActions struct {
	AddPairingRequest    string `json:"add-pairing-request,omitempty"`
	RemovePairingRequest string `json:"remove-pairing-request,omitempty"`
	AddPairedHost        string `json:"add-paired-host,omitempty"`
	RemovePairedHost     string `json:"remove-paired-host,omitempty"`
}

// HostActions は、ほかのホストに応じて常駐が行うアクション。アクションの定義が役を名乗る（Go はアクションの id を知らない）
func (e *Engine) HostActions() (ids HostActions, err error) {
	e.mu.Lock()
	defer e.mu.Unlock()
	defer func() {
		if r := recover(); r != nil {
			err = fmt.Errorf("engine: %v", r)
		}
	}()
	err = json.Unmarshal([]byte(e.hosts()), &ids)
	return ids, err
}
