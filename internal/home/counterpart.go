package home

import (
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
)

const counterpartFile = "counterpart.json"

// 常駐が動く相手の OS（Counterpart.OS）
const (
	CounterpartWSL     = "wsl"     // Windows から、WSL の常駐を使う
	CounterpartWindows = "windows" // WSL から、Windows の常駐を使う
)

// Counterpart は、この保管庫が、自分では常駐を立てずに、同じマシンの相手の常駐を使うと覚えた先（counterpart.json）
type Counterpart struct {
	OS     string `json:"os"`               // CounterpartWSL か CounterpartWindows
	Distro string `json:"distro,omitempty"` // OS が CounterpartWSL のときの、WSL の distro の名前
	Vault  string `json:"vault"`            // その常駐の matomezu 保管庫フォルダの、ここから見た場所
	Dir    string `json:"dir,omitempty"`    // 相手の OS の matomezu を動かすフォルダ（相手の OS での書き方。空ならホーム）。matomezu のリポジトリなら、その開発の保管庫を使う
}

// ReadCounterpart は、この保管庫が使うと覚えた相手の常駐（覚えていなければ nil）
func (h *Home) ReadCounterpart() (*Counterpart, error) {
	b, err := os.ReadFile(filepath.Join(h.Dir, counterpartFile))
	if errors.Is(err, fs.ErrNotExist) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	var u Counterpart
	if err := json.Unmarshal(b, &u); err != nil {
		return nil, fmt.Errorf("%s: %w", counterpartFile, err)
	}
	return &u, nil
}

// WriteCounterpart は、相手の常駐 u を使うと覚える
func (h *Home) WriteCounterpart(u Counterpart) error {
	b, err := json.MarshalIndent(u, "", "  ")
	if err != nil {
		return err
	}
	tmp := filepath.Join(h.Dir, counterpartFile+".tmp")
	if err := os.WriteFile(tmp, b, 0o600); err != nil {
		return err
	}
	return os.Rename(tmp, filepath.Join(h.Dir, counterpartFile))
}

// RemoveCounterpart は、相手の常駐を使うのをやめる（覚えていなければ何もしない）
func (h *Home) RemoveCounterpart() error {
	err := os.Remove(filepath.Join(h.Dir, counterpartFile))
	if errors.Is(err, fs.ErrNotExist) {
		return nil
	}
	return err
}
