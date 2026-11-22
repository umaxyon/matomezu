package main

import (
	"bytes"
	"errors"
	"reflect"
	"strings"
	"testing"
)

func TestInstallerFor(t *testing.T) {
	for _, c := range []struct {
		dir  string
		name string
		ok   bool
	}{
		{`C:\Users\a\AppData\Local\Volta\tools\image\packages\matomezu\node_modules\matomezu`, "Volta", true},
		{"/home/a/.volta/tools/image/packages/matomezu/lib/node_modules/matomezu", "Volta", true},
		{"/home/a/.local/share/pnpm/global/5/node_modules/matomezu", "pnpm", true},
		{"/home/a/.bun/install/global/node_modules/matomezu", "bun", true},
		{"/usr/local/lib/node_modules/matomezu", "npm", true},
		{`C:\Users\a\AppData\Roaming\npm\node_modules\matomezu`, "npm", true},
		{"/home/a/somewhere/matomezu", "", false},
		{"", "", false},
	} {
		in, ok := installerFor(c.dir)
		if ok != c.ok || in.name != c.name {
			t.Errorf("installerFor(%q) = %q, %v; want %q, %v", c.dir, in.name, ok, c.name, c.ok)
		}
	}
}

// fakeUpdater は、呼んだコマンドを並べて覚える updater
func fakeUpdater(found map[string]bool, plugins map[string]bool, opencode bool) (*updater, *[]string, *bytes.Buffer) {
	var ran []string
	out := &bytes.Buffer{}
	u := &updater{
		out: out,
		lookPath: func(name string) (string, error) {
			if found[name] {
				return "/bin/" + name, nil
			}
			return "", errors.New("not found")
		},
		run: func(name string, args ...string) error {
			ran = append(ran, strings.Join(append([]string{name}, args...), " "))
			return nil
		},
		output: func(name string, args ...string) (string, error) {
			ran = append(ran, strings.Join(append([]string{name}, args...), " "))
			return "2.0.0", nil
		},
		pluginInstalled:   func(ai, _ string) bool { return plugins[ai] },
		opencodeHasPlugin: func() bool { return opencode },
		restartServer: func() error {
			ran = append(ran, "restart the server")
			return nil
		},
	}
	return u, &ran, out
}

func TestUpdateRunsTheInstallerThenThePluginsThenTheServer(t *testing.T) {
	u, ran, out := fakeUpdater(
		map[string]bool{"matomezu": true, "claude": true, "codex": true, "opencode": true},
		map[string]bool{"claude": true},
		true,
	)
	if err := u.update("/usr/local/lib/node_modules/matomezu", "1.0.0"); err != nil {
		t.Fatal(err)
	}
	want := []string{
		"npm install -g matomezu@latest",
		"/bin/matomezu version",
		"/bin/matomezu plugin install claude",
		"opencode plugin add matomezu-opencode@2.0.0",
		"restart the server",
	}
	if !reflect.DeepEqual(*ran, want) {
		t.Fatalf("ran %q; want %q", *ran, want)
	}
	if !strings.Contains(out.String(), "from 1.0.0 to 2.0.0") {
		t.Fatalf("out = %s", out)
	}
}

func TestUpdateStopsWhenItCannotTellTheInstaller(t *testing.T) {
	u, ran, out := fakeUpdater(map[string]bool{"matomezu": true}, nil, false)
	if err := u.update("/somewhere/matomezu", "1.0.0"); err == nil {
		t.Fatal("updated")
	}
	if len(*ran) != 0 || !strings.Contains(out.String(), "npm install -g matomezu@latest") {
		t.Fatalf("ran %q, out %s", *ran, out)
	}
}
