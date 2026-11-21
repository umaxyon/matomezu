package launch

import (
	"encoding/json"
	"os"
	"regexp"
	"testing"
)

// フックが matomezu を見つけられないときの文は、hooks.json の 6 か所（sh と PowerShell、話しかけたとき・会話を始めたとき・ターンの終わり）とも NotFoundMessage と同じ
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
	if n != 6 {
		t.Errorf("checked %d commands, want 6", n)
	}
}
