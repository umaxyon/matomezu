package launch

import (
	"encoding/json"
	"os"
	"testing"
)

// 外すコマンドが名指すプラグインと置き場所の名前は、置き場所の marketplace.json の名前
func TestRemoveNamesTheMarketplace(t *testing.T) {
	b, err := os.ReadFile("../.agents/plugins/marketplace.json")
	if err != nil {
		t.Fatal(err)
	}
	var m struct {
		Name    string `json:"name"`
		Plugins []struct {
			Name string `json:"name"`
		} `json:"plugins"`
	}
	if err := json.Unmarshal(b, &m); err != nil || len(m.Plugins) != 1 {
		t.Fatalf("marketplace.json: %v", err)
	}
	if got, want := Remove[0][len(Remove[0])-1], m.Plugins[0].Name+"@"+m.Name; got != want {
		t.Errorf("plugin %q, want %q", got, want)
	}
	if got := Remove[1][len(Remove[1])-1]; got != m.Name {
		t.Errorf("marketplace %q, want %q", got, m.Name)
	}
}
