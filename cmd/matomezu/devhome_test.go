package main

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/umaxyon/matomezu/internal/home"
)

// 開発の常駐: .git のフォルダでも、作業ツリーの .git のファイル（gitdir と commondir）でも、共通のフォルダの隣の .dev-home を見つける。
// .dev-home の実行ファイルが無いリポジトリ・リポジトリの外は空
func TestDevRoot(t *testing.T) {
	repo := t.TempDir()
	write := func(path, text string) {
		t.Helper()
		if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(path, []byte(text), 0o755); err != nil {
			t.Fatal(err)
		}
	}
	if err := os.MkdirAll(filepath.Join(repo, ".git", "worktrees", "w1"), 0o755); err != nil {
		t.Fatal(err)
	}
	sub := filepath.Join(repo, "web", "src")
	if err := os.MkdirAll(sub, 0o755); err != nil {
		t.Fatal(err)
	}
	tree := filepath.Join(t.TempDir(), "w1")
	write(filepath.Join(tree, ".git"), "gitdir: "+filepath.Join(repo, ".git", "worktrees", "w1")+"\n")
	write(filepath.Join(repo, ".git", "worktrees", "w1", "commondir"), "../..\n")
	relTree := filepath.Join(repo, "rel")
	write(filepath.Join(relTree, ".git"), "gitdir: ../.git/worktrees/w1\n")

	for _, dir := range []string{repo, sub, tree, relTree, ""} {
		if got := devRoot(dir); got != "" {
			t.Errorf("without .dev-home: devRoot(%q) = %q", dir, got)
		}
	}
	write(devBinary(repo), "")
	for _, dir := range []string{repo, sub, tree, relTree} {
		if got := devRoot(dir); got != repo {
			t.Errorf("devRoot(%q) = %q, want %q", dir, got, repo)
		}
	}
	if got := devRoot(t.TempDir()); got != "" {
		t.Errorf("outside a repository = %q", got)
	}
}

// Claude Code の monitor には CLAUDE_PROJECT_DIR が渡らないので、今いるフォルダで見る
func TestClaudeProjectDir(t *testing.T) {
	t.Setenv("CLAUDE_PROJECT_DIR", "/p")
	if got := claudeProjectDir(); got != "/p" {
		t.Errorf("with the env %q", got)
	}
	t.Setenv("CLAUDE_PROJECT_DIR", "")
	wd, _ := os.Getwd()
	if got := claudeProjectDir(); got != wd {
		t.Errorf("without the env %q, want %q", got, wd)
	}
}

// npm で配る版（version に版の番号が入った物）は、開いたフォルダに .dev-home の実行ファイルがあっても開発の常駐を使わない（よそのリポジトリの物を起動しない）
func TestDevRootOnlyInTheDevelopmentBuild(t *testing.T) {
	repo := t.TempDir()
	if err := os.MkdirAll(filepath.Join(repo, ".git"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(filepath.Join(repo, devHomeDir), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(devBinary(repo), nil, 0o755); err != nil {
		t.Fatal(err)
	}
	if got := devRoot(repo); got != repo {
		t.Fatalf("development build: %q, want %q", got, repo)
	}
	saved := version
	t.Cleanup(func() { version = saved })
	version = "1.2.3"
	if got := devRoot(repo); got != "" {
		t.Errorf("released build: %q, want none", got)
	}
}

// 配る版が、開発の常駐のあるリポジトリの中で呼ばれたら知らせる（開発の版・リポジトリの外・MATOMEZU_HOME があるときは知らせない）
func TestDevNotUsedNote(t *testing.T) {
	repo := t.TempDir()
	if err := os.MkdirAll(filepath.Join(repo, ".git"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(filepath.Join(repo, devHomeDir), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(devBinary(repo), nil, 0o755); err != nil {
		t.Fatal(err)
	}
	if got := devNotUsedNote(repo); got != "" {
		t.Fatalf("development build: %q", got)
	}
	saved := version
	t.Cleanup(func() { version = saved })
	version = "1.2.3"
	t.Setenv(home.EnvHome, "")
	if got := devNotUsedNote(repo); !strings.Contains(got, repo) || !strings.Contains(got, "1.2.3") {
		t.Errorf("released build in the repository: %q", got)
	}
	// MATOMEZU_HOME があれば、それが保管庫を決める（開発の常駐を指していることもある）ので知らせない
	t.Setenv(home.EnvHome, filepath.Join(repo, devHomeDir))
	if got := devNotUsedNote(repo); got != "" {
		t.Errorf("with MATOMEZU_HOME: %q", got)
	}
	t.Setenv(home.EnvHome, "")
	if got := devNotUsedNote(t.TempDir()); got != "" {
		t.Errorf("outside a repository: %q", got)
	}
}
