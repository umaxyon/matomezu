package main

// AI のプログラム（claude・codex・opencode）を探す。claude が PATH に無ければ、Claude Desktop が Code タブのために置いた CLI を使う

import (
	"errors"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"

	claudelaunch "github.com/umaxyon/matomezu/clients/claude-code/launch"
)

// errNoClaude は、PATH にも Desktop の置き場にも claude が無いときの断り
var errNoClaude = errors.New(claudelaunch.NotFoundMessage)

// findProgram は、AI のプログラム name の実行ファイルを探す
func findProgram(name string) (string, error) {
	return programFinder{lookPath: exec.LookPath, desktopRoots: desktopRoots(), exe: claudelaunch.Exe(runtime.GOOS)}.find(name)
}

// fromDesktop は、実行ファイル path が Desktop の置き場の CLI か
func fromDesktop(path string) bool {
	for _, root := range desktopRoots() {
		if rel, err := filepath.Rel(root, path); err == nil && !strings.HasPrefix(rel, "..") {
			return true
		}
	}
	return false
}

func desktopRoots() []string {
	home, _ := os.UserHomeDir()
	return claudelaunch.DesktopRoots(runtime.GOOS, home, os.Getenv("APPDATA"), os.Getenv("LOCALAPPDATA"))
}

// programFinder は、探すのに使う OS への口（テストで差し替える）
type programFinder struct {
	lookPath     func(string) (string, error)
	desktopRoots []string
	exe          string
}

func (f programFinder) find(name string) (string, error) {
	p, err := f.lookPath(name)
	if err == nil || name != "claude" {
		return p, err
	}
	var newest claudelaunch.DesktopCLI
	for _, c := range claudelaunch.DesktopCLIs(f.desktopRoots, f.exe) {
		if newest.Path == "" || versionLess(newest.Version, c.Version) {
			newest = c
		}
	}
	if newest.Path == "" {
		return "", errNoClaude
	}
	return newest.Path, nil
}
