package home

import (
	"os"
	"path/filepath"
	"reflect"
	"sort"
	"strings"
	"testing"
	"time"
)

func TestBinDirIsUnderHomeWhateverTheVault(t *testing.T) {
	h := t.TempDir()
	t.Setenv("HOME", h)
	t.Setenv("USERPROFILE", h)
	t.Setenv(EnvHome, t.TempDir())
	got, err := BinDir()
	if want := filepath.Join(h, ".matomezu", "bin"); err != nil || got != want {
		t.Fatalf("BinDir() = %q, %v; want %q", got, err, want)
	}
}

func TestBinNamesMatchTheNpmEntry(t *testing.T) {
	b, err := os.ReadFile(filepath.Join("..", "..", "scripts", "npm-pack", "manifest.ts"))
	if err != nil {
		t.Fatal(err)
	}
	for _, want := range []string{`export const BIN_DIR = [".matomezu", "bin"]`, `export const INSTALLED_NAME = "` + InstalledName + `"`} {
		if !strings.Contains(string(b), want) {
			t.Errorf("manifest.ts does not have %s", want)
		}
	}
}

func TestReadInstalled(t *testing.T) {
	dir := t.TempDir()
	if in, err := ReadInstalled(dir); in != nil || err != nil {
		t.Fatalf("no mark: %v, %v", in, err)
	}
	if err := os.WriteFile(filepath.Join(dir, InstalledName), []byte(`{"version":"1.2.3","exe":"/x/matomezu"}`), 0o600); err != nil {
		t.Fatal(err)
	}
	in, err := ReadInstalled(dir)
	if err != nil || *in != (Installed{Version: "1.2.3", Exe: "/x/matomezu"}) {
		t.Fatalf("ReadInstalled = %v, %v", in, err)
	}
}

func TestPruneBinsKeepsTheGivenAndTheNewestOther(t *testing.T) {
	dir := t.TempDir()
	at := time.Now()
	for i, v := range []string{"1.0.0", "1.1.0", "1.2.0", "1.3.0", "1.4.0"} {
		p := filepath.Join(dir, v)
		if err := os.MkdirAll(p, 0o700); err != nil {
			t.Fatal(err)
		}
		if err := os.Chtimes(p, at, at.Add(time.Duration(i)*time.Minute)); err != nil {
			t.Fatal(err)
		}
	}
	if err := os.WriteFile(filepath.Join(dir, InstalledName), []byte("{}"), 0o600); err != nil {
		t.Fatal(err)
	}
	PruneBins(dir, "1.4.0", "1.0.0")
	entries, _ := os.ReadDir(dir)
	var left []string
	for _, e := range entries {
		left = append(left, e.Name())
	}
	sort.Strings(left)
	if want := []string{"1.0.0", "1.3.0", "1.4.0", InstalledName}; !reflect.DeepEqual(left, want) {
		t.Fatalf("left %v; want %v", left, want)
	}
}
