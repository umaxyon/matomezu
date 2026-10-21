package home

import (
	"errors"
	"os"
	"path/filepath"
	"runtime"
	"testing"
)

func TestDirFollowsEnv(t *testing.T) {
	dir := t.TempDir()
	t.Setenv(EnvHome, dir)
	got, err := Dir()
	if err != nil || got != dir {
		t.Fatalf("Dir() = %q, %v; want %q", got, err, dir)
	}
}

func TestOpenMakesPrivateDir(t *testing.T) {
	dir := filepath.Join(t.TempDir(), "a", "matomezu")
	if _, err := Open(dir); err != nil {
		t.Fatal(err)
	}
	st, err := os.Stat(dir)
	if err != nil {
		t.Fatal(err)
	}
	if runtime.GOOS != "windows" && st.Mode().Perm() != 0o700 {
		t.Fatalf("perm = %v; want 0700", st.Mode().Perm())
	}
}

func TestSecondLockFails(t *testing.T) {
	h, _ := Open(t.TempDir())
	l, err := h.Lock()
	if err != nil {
		t.Fatal(err)
	}
	if up, _ := h.Running(); !up {
		t.Fatal("Running() = false while locked")
	}
	if _, err := h.Lock(); !errors.Is(err, ErrRunning) {
		t.Fatalf("second Lock() = %v; want ErrRunning", err)
	}
	if err := l.Unlock(); err != nil {
		t.Fatal(err)
	}
	if up, _ := h.Running(); up {
		t.Fatal("Running() = true after unlock")
	}
	if _, err := h.Lock(); err != nil {
		t.Fatalf("Lock() after unlock = %v", err)
	}
}

func TestServerFileIsPrivateAndRoundTrips(t *testing.T) {
	h, _ := Open(t.TempDir())
	if s, err := h.ReadServer(); s != nil || err != nil {
		t.Fatalf("ReadServer() before write = %v, %v", s, err)
	}
	want := Server{URL: "http://127.0.0.1:1/", Token: "t", PID: 1, Version: "v"}
	if err := h.WriteServer(want); err != nil {
		t.Fatal(err)
	}
	got, err := h.ReadServer()
	if err != nil || *got != want {
		t.Fatalf("ReadServer() = %v, %v; want %v", got, err, want)
	}
	st, _ := os.Stat(filepath.Join(h.Dir, serverName))
	if runtime.GOOS != "windows" && st.Mode().Perm() != 0o600 {
		t.Fatalf("perm = %v; want 0600", st.Mode().Perm())
	}
	if err := h.RemoveServer(); err != nil {
		t.Fatal(err)
	}
	if err := h.RemoveServer(); err != nil {
		t.Fatalf("second RemoveServer() = %v", err)
	}
}
