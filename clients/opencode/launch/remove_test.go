package launch

import (
	"encoding/json"
	"os"
	"testing"
)

// 外すコマンドが名指すパッケージは、プラグインの package.json の名前
func TestRemoveNamesThePackage(t *testing.T) {
	b, err := os.ReadFile("../package.json")
	if err != nil {
		t.Fatal(err)
	}
	var p struct {
		Name string `json:"name"`
	}
	if err := json.Unmarshal(b, &p); err != nil {
		t.Fatal(err)
	}
	if p.Name != Package {
		t.Errorf("package.json name %q, want %q", p.Name, Package)
	}
}
