package main

import (
	"bytes"
	"strings"
	"testing"

	"github.com/alecthomas/kong"
)

func TestVersionFlagPrintsVersion(t *testing.T) {
	var out bytes.Buffer
	exited := -1
	opts := append(cliOptions(), kong.Writers(&out, &out), kong.Exit(func(code int) { exited = code; panic(exited) }))
	parser, err := kong.New(&cli{}, opts...)
	if err != nil {
		t.Fatal(err)
	}
	func() {
		defer func() { _ = recover() }()
		_, _ = parser.Parse([]string{"--version"})
	}()
	if exited != 0 {
		t.Fatalf("exit %d, want 0", exited)
	}
	if got := strings.TrimSpace(out.String()); got != version {
		t.Fatalf("printed %q, want %q", got, version)
	}
}
