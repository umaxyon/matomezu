package home

import (
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
)

const useName = "use.json"

// 常駐が動くほかの OS（Use.OS）
const (
	UseWSL     = "wsl"     // Windows から、WSL の常駐を使う
	UseWindows = "windows" // WSL から、Windows の常駐を使う
)

// Use は、この保管庫が、自分では常駐を立てずに、同じ機械のほかの OS の常駐を使うと覚えた先（use.json）
type Use struct {
	OS     string `json:"os"`               // UseWSL か UseWindows
	Distro string `json:"distro,omitempty"` // OS が UseWSL のときの、WSL の distro の名前
	Vault  string `json:"vault"`            // その常駐の matomezu 保管庫フォルダの、ここから見た場所
}

// ReadUse は、この保管庫が使うと覚えたほかの OS の常駐（覚えていなければ nil）
func (h *Home) ReadUse() (*Use, error) {
	b, err := os.ReadFile(filepath.Join(h.Dir, useName))
	if errors.Is(err, fs.ErrNotExist) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	var u Use
	if err := json.Unmarshal(b, &u); err != nil {
		return nil, fmt.Errorf("%s: %w", useName, err)
	}
	return &u, nil
}

// WriteUse は、ほかの OS の常駐 u を使うと覚える
func (h *Home) WriteUse(u Use) error {
	b, err := json.MarshalIndent(u, "", "  ")
	if err != nil {
		return err
	}
	tmp := filepath.Join(h.Dir, useName+".tmp")
	if err := os.WriteFile(tmp, b, 0o600); err != nil {
		return err
	}
	return os.Rename(tmp, filepath.Join(h.Dir, useName))
}

// RemoveUse は、ほかの OS の常駐を使うのをやめる（覚えていなければ何もしない）
func (h *Home) RemoveUse() error {
	err := os.Remove(filepath.Join(h.Dir, useName))
	if errors.Is(err, fs.ErrNotExist) {
		return nil
	}
	return err
}
