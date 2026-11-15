package main

import (
	"os"
	"path/filepath"
	"testing"
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
