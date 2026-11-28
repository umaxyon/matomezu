//go:build windows

package firewall

import (
	"encoding/base64"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"unicode/utf16"
)

// ForThisOS は、この OS の規則を読み書きする物（Windows）
func ForThisOS() Rules {
	// exe が分からなくても nil にしない（nil は規則の要らない OS で、入口を許可なしに開くため）。読みが失敗し、効かない様子になる
	exe, err := os.Executable()
	return windowsRules{exe: exe, exeErr: err}
}

type windowsRules struct {
	exe    string
	exeErr error
}

// powershell は、Windows の PowerShell の場所（PATH を探さない）
func powershell() string {
	root := os.Getenv("SystemRoot")
	if root == "" {
		root = `C:\Windows`
	}
	return filepath.Join(root, "System32", "WindowsPowerShell", "v1.0", "powershell.exe")
}

// encoded は、-EncodedCommand に渡す形（UTF-16LE の base64。中身をファイルに書かずに渡す）
func encoded(script string) string {
	u := utf16.Encode([]rune(script))
	b := make([]byte, len(u)*2)
	for i, c := range u {
		b[2*i], b[2*i+1] = byte(c), byte(c>>8)
	}
	return base64.StdEncoding.EncodeToString(b)
}

func run(script string) ([]byte, error) {
	cmd := exec.Command(powershell(), "-NoProfile", "-NonInteractive", "-EncodedCommand", encoded(script))
	out, err := cmd.Output()
	if err != nil {
		return out, fmt.Errorf("firewall: powershell: %w", err)
	}
	return out, nil
}

func (w windowsRules) Read() (Reading, error) {
	if w.exeErr != nil {
		return Reading{}, fmt.Errorf("firewall: no executable: %w", w.exeErr)
	}
	out, err := run(ReadScript(w.exe))
	if err != nil {
		return Reading{}, err
	}
	var r Reading
	if err := json.Unmarshal([]byte(strings.TrimSpace(string(out))), &r); err != nil {
		return Reading{}, fmt.Errorf("firewall: could not read the rules: %w", err)
	}
	return r, nil
}

// elevated は、script を管理者として流す（UAC を出し、終わるまで待つ）。成否は呼ぶ側が読み直して決める
func elevated(script string, err error) error {
	if err != nil {
		return err
	}
	_, err = run(ElevateScript(powershell(), encoded(script)))
	return err
}

func (windowsRules) Allow(port int) error    { return elevated(AllowScript(port)) }
func (windowsRules) Deny(port int) error     { return elevated(DenyScript(port)) }
func (windowsRules) Move(from, to int) error { return elevated(MoveScript(from, to)) }
