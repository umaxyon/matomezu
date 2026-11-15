package launch

import (
	"os"
	"path/filepath"
	"testing"
)

// 入れた元は、節 [marketplaces.matomezu] の source だけを読む。基本の文字列・リテラルの文字列・Windows の \\?\ の頭
func TestInstalledFrom(t *testing.T) {
	for _, c := range []struct{ name, config, want string }{
		{"basic", "[marketplaces.other]\nsource = \"/x\"\n\n[marketplaces.matomezu]\nsource_type = \"local\"\nsource = \"/home/u/matomezu/clients/codex\"\n", "/home/u/matomezu/clients/codex"},
		{"windows", "[marketplaces.matomezu]\nsource_type = \"local\"\nsource = '\\\\?\\C:\\Users\\u\\matomezu\\clients\\codex'\n", `C:\Users\u\matomezu\clients\codex`},
		{"escaped", "[marketplaces.matomezu]\nsource = \"C:\\\\Users\\\\u\"  # comment\n", `C:\Users\u`},
		{"other section", "[marketplaces.other]\nsource = \"/x\"\n", ""},
		{"after the section", "[marketplaces.matomezu]\nsource_type = \"local\"\n[plugins.x]\nsource = \"/y\"\n", ""},
	} {
		dir := t.TempDir()
		if err := os.WriteFile(filepath.Join(dir, "config.toml"), []byte(c.config), 0o644); err != nil {
			t.Fatal(err)
		}
		if got := InstalledFrom(dir); got != c.want {
			t.Errorf("%s: %q, want %q", c.name, got, c.want)
		}
	}
	if got := InstalledFrom(t.TempDir()); got != "" {
		t.Errorf("no config: %q", got)
	}
}
