package main

import (
	"errors"
	"os"
	"path/filepath"
	"testing"

	claudelaunch "github.com/umaxyon/matomezu/clients/claude-code/launch"
)

// desktopTree は、Desktop の置き場をまねた木を作る（%APPDATA% に versions、ストアの形の置き場に msix の版）
func desktopTree(t *testing.T, versions []string, msix string) (appData, localAppData string) {
	t.Helper()
	dir := t.TempDir()
	appData, localAppData = filepath.Join(dir, "Roaming"), filepath.Join(dir, "Local")
	put := func(root, version string) {
		p := filepath.Join(root, version, "0123abcd")
		if err := os.MkdirAll(p, 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(filepath.Join(p, "claude.exe"), nil, 0o755); err != nil {
			t.Fatal(err)
		}
	}
	for _, v := range versions {
		put(filepath.Join(appData, "Claude", "claude-code"), v)
	}
	if msix != "" {
		put(filepath.Join(localAppData, "Packages", "Claude_pzs8sxrjxfjjc", "LocalCache", "Roaming", "Claude", "claude-code"), msix)
	}
	return appData, localAppData
}

func finder(onPath map[string]bool, appData, localAppData string) programFinder {
	return programFinder{
		lookPath: func(name string) (string, error) {
			if onPath[name] {
				return "/bin/" + name, nil
			}
			return "", errors.New("not found")
		},
		desktopRoots: claudelaunch.DesktopRoots("windows", "", appData, localAppData),
		exe:          "claude.exe",
	}
}

func TestFindProgramTakesClaudeOnPathFirst(t *testing.T) {
	appData, local := desktopTree(t, []string{"2.1.330"}, "")
	got, err := finder(map[string]bool{"claude": true}, appData, local).find("claude")
	if err != nil || got != "/bin/claude" {
		t.Fatalf("find = %q, %v", got, err)
	}
}

// 一番新しい版を版の順で選ぶ（文字の順なら 2.1.9 が勝つ）。ストアの形の置き場も見る
func TestFindProgramTakesTheNewestDesktopCLI(t *testing.T) {
	appData, local := desktopTree(t, []string{"2.1.9", "2.1.330"}, "2.1.100")
	got, err := finder(nil, appData, local).find("claude")
	if err != nil {
		t.Fatal(err)
	}
	if want := filepath.Join(appData, "Claude", "claude-code", "2.1.330", "0123abcd", "claude.exe"); got != want {
		t.Fatalf("find = %q, want %q", got, want)
	}
	appData, local = desktopTree(t, []string{"2.1.9"}, "2.1.100")
	if got, _ := finder(nil, appData, local).find("claude"); filepath.Base(filepath.Dir(filepath.Dir(got))) != "2.1.100" {
		t.Fatalf("find = %q, want the one in the store package", got)
	}
}

func TestFindProgramRefusesWhenClaudeIsNowhere(t *testing.T) {
	appData, local := desktopTree(t, nil, "")
	if _, err := finder(nil, appData, local).find("claude"); !errors.Is(err, errNoClaude) {
		t.Fatalf("err = %v", err)
	}
	// claude のほかは Desktop の置き場を見ない
	appData, local = desktopTree(t, []string{"2.1.330"}, "")
	if _, err := finder(nil, appData, local).find("codex"); err == nil || errors.Is(err, errNoClaude) {
		t.Fatalf("err = %v", err)
	}
}

// macOS では Desktop の置き場の CLI は claude.app の中にある
func TestFindProgramTakesTheDesktopCLIOnMac(t *testing.T) {
	home := t.TempDir()
	exe := claudelaunch.Exe("darwin")
	p := filepath.Join(home, "Library", "Application Support", "Claude", "claude-code", "2.1.330", "4262a1273231", exe)
	if err := os.MkdirAll(filepath.Dir(p), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(p, nil, 0o755); err != nil {
		t.Fatal(err)
	}
	f := programFinder{
		lookPath:     func(string) (string, error) { return "", errors.New("not found") },
		desktopRoots: claudelaunch.DesktopRoots("darwin", home, "", ""),
		exe:          exe,
	}
	if got, err := f.find("claude"); err != nil || got != p {
		t.Fatalf("find = %q, %v, want %q", got, err, p)
	}
}
