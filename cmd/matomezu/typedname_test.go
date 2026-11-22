package main

import (
	"errors"
	"testing"
)

func TestTypedName(t *testing.T) {
	found := func(p string) func(string) (string, error) {
		return func(string) (string, error) { return p, nil }
	}
	for _, c := range []struct {
		goos string
		look func(string) (string, error)
		want string
	}{
		{"windows", found(`C:\Users\a\AppData\Roaming\npm\matomezu.CMD`), "matomezu.cmd"},
		{"windows", found(`C:\Users\a\AppData\Local\Volta\bin\matomezu.exe`), "matomezu"},
		{"windows", func(string) (string, error) { return "", errors.New("not found") }, "matomezu"},
		{"linux", found("/usr/local/bin/matomezu"), "matomezu"},
	} {
		if got := typedNameOn(c.goos, c.look, "matomezu"); got != c.want {
			t.Errorf("%s: typedName = %q, want %q", c.goos, got, c.want)
		}
	}
}
