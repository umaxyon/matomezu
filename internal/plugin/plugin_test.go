package plugin

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

var modules = Modules{
	Engine: []string{"matomezu"},
	UI:     []string{"matomezu", "matomezu/ui", "react", "react/jsx-runtime"},
}

func TestBuildsAnExamplePluginBorrowingTheModules(t *testing.T) {
	b, err := Build("../../test/examples/plugins/hoge-flow", modules)
	if err != nil {
		t.Fatal(err)
	}
	for name, js := range map[string]string{"engine": b.Engine, "ui": string(b.UI)} {
		if !strings.Contains(js, `globalThis.__matomezuModules["matomezu"]`) || !strings.Contains(js, "hoge-flow/diamond") {
			t.Fatalf("%s does not borrow matomezu or lacks the plugin:\n%s", name, js)
		}
		// 借りた物（zod・React）を取り込んでいない
		if strings.Contains(js, "ZodError") || strings.Contains(js, "useState") && name == "engine" {
			t.Fatalf("%s bundles a borrowed module", name)
		}
	}
	if !strings.Contains(string(b.UI), `globalThis.__matomezuModules["react/jsx-runtime"]`) || !strings.Contains(string(b.UI), "export {") {
		t.Fatalf("ui is not an ES module borrowing react/jsx-runtime:\n%s", b.UI)
	}
	if b.CSS != nil {
		t.Fatalf("hoge-flow has no CSS, got %s", b.CSS)
	}
}

func TestBuildsTheCSSOfAPlugin(t *testing.T) {
	b, err := Build("../../test/examples/plugins/hoge", modules)
	if err != nil {
		t.Fatal(err)
	}
	if len(b.CSS) == 0 {
		t.Fatal("hoge imports a CSS module, but no CSS was built")
	}
}

func write(t *testing.T, files map[string]string) string {
	t.Helper()
	dir := t.TempDir()
	for name, text := range files {
		if err := os.WriteFile(filepath.Join(dir, name), []byte(text), 0o600); err != nil {
			t.Fatal(err)
		}
	}
	return dir
}

func TestRefusesImportsThatAreNotBorrowed(t *testing.T) {
	cases := map[string]string{
		`import { z } from "zod"`:            `import { z } from "matomezu"`,
		`import { x } from "left-pad"`:       `"left-pad" cannot be imported`,
		`import { useT } from "matomezu/ui"`: `"matomezu/ui" cannot be imported`, // index.ts は見た目を読まない
	}
	for line, want := range cases {
		dir := write(t, map[string]string{
			"index.ts": line + "\nexport default { id: \"x\", v: [" + strings.Fields(line)[2] + "] }\n",
			"ui.tsx":   "export default {}\n",
		})
		_, err := Build(dir, modules)
		if err == nil || !strings.Contains(err.Error(), want) {
			t.Fatalf("%s: err = %v, want %q", line, err, want)
		}
	}
}

func TestNeedsBothEntries(t *testing.T) {
	dir := write(t, map[string]string{"index.ts": "export default {}\n"})
	if _, err := Build(dir, modules); err == nil || !strings.Contains(err.Error(), "no ui.tsx") {
		t.Fatalf("err = %v", err)
	}
}
