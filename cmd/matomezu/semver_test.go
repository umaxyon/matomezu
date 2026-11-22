package main

import "testing"

func TestVersionLess(t *testing.T) {
	for _, c := range []struct {
		a, b string
		less bool
	}{
		{"1.2.3", "1.2.4", true},
		{"1.2.4", "1.2.3", false},
		{"1.2.3", "1.2.3", false},
		{"1.9.0", "1.10.0", true},
		{"1.0.0-rc.1", "1.0.0", true},
		{"1.0.0", "1.0.0-rc.1", false},
		{"1.0.0-rc.2", "1.0.0-rc.10", true},
		{"1.0.0-1", "1.0.0-alpha", true},
		{"0.0.0-lab.261121165037", "0.0.0-lab.261121180048", true},
		{"0.0.0-lab.261121180048", "0.0.0-lab.261121165037", false},
	} {
		if got := versionLess(c.a, c.b); got != c.less {
			t.Errorf("versionLess(%q, %q) = %v; want %v", c.a, c.b, got, c.less)
		}
	}
}

func TestOlderServerOnlyForReleasedBuilds(t *testing.T) {
	t.Setenv("HOME", t.TempDir())
	t.Setenv("USERPROFILE", t.TempDir())
	was := version
	t.Cleanup(func() { version = was })
	version = "1.1.0"
	for _, c := range []struct {
		running string
		older   bool
	}{{"1.0.0", true}, {"1.1.0", false}, {"1.2.0", false}, {devVersion, false}} {
		if got := olderServer(c.running); got != c.older {
			t.Errorf("olderServer(%q) = %v; want %v", c.running, got, c.older)
		}
	}
	version = devVersion
	if olderServer("1.0.0") {
		t.Error("a development build replaced a server")
	}
}
