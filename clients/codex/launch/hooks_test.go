package launch

import (
	"encoding/json"
	"os"
	"regexp"
	"strings"
	"testing"
)

// フックが matomezu を見つけられないときの文は、hooks.json の 8 か所（sh と PowerShell、話しかけたとき・会話を始めたとき・ツールを使ったあと・ターンの終わり）とも NotFoundMessage と同じ
func TestHooksShowTheNotFoundMessage(t *testing.T) {
	b, err := os.ReadFile("../hooks/hooks.json")
	if err != nil {
		t.Fatal(err)
	}
	var f struct {
		Hooks map[string][]struct {
			Hooks []struct {
				Command        string `json:"command"`
				CommandWindows string `json:"commandWindows"`
			} `json:"hooks"`
		} `json:"hooks"`
	}
	if err := json.Unmarshal(b, &f); err != nil {
		t.Fatal(err)
	}
	re := regexp.MustCompile(`\{"systemMessage":"([^"]*)"\}`)
	n := 0
	for event, groups := range f.Hooks {
		for _, g := range groups {
			for _, h := range g.Hooks {
				for _, c := range []string{h.Command, h.CommandWindows} {
					m := re.FindStringSubmatch(c)
					if m == nil || m[1] != NotFoundMessage {
						t.Errorf("%s: %q does not show NotFoundMessage", event, c)
					}
					n++
				}
			}
		}
	}
	if n != 8 {
		t.Errorf("checked %d commands, want 8", n)
	}
}

// Windows のフックは、npm が置く matomezu.ps1（PowerShell の既定の実行ポリシーで止まる）を通らず、実行ファイルの matomezu（.cmd・.exe）を呼ぶ
func TestWindowsHooksSkipThePowerShellScript(t *testing.T) {
	b, err := os.ReadFile("../hooks/hooks.json")
	if err != nil {
		t.Fatal(err)
	}
	var f struct {
		Hooks map[string][]struct {
			Hooks []struct {
				CommandWindows string `json:"commandWindows"`
			} `json:"hooks"`
		} `json:"hooks"`
	}
	if err := json.Unmarshal(b, &f); err != nil {
		t.Fatal(err)
	}
	for event, groups := range f.Hooks {
		for _, g := range groups {
			for _, h := range g.Hooks {
				if !strings.HasPrefix(h.CommandWindows, "$m = Get-Command matomezu -CommandType Application ") || !strings.Contains(h.CommandWindows, "& $m.Source codex hook ") {
					t.Errorf("%s: %q may run matomezu.ps1", event, h.CommandWindows)
				}
			}
		}
	}
}
