package main

import (
	"slices"
	"testing"

	"github.com/alecthomas/kong"
)

func TestStartCommandRouting(t *testing.T) {
	tests := []struct {
		args   []string
		legacy bool
		route  string
		aiArgs []string
	}{
		{args: []string{"start"}, legacy: true},
		{args: []string{"start", "--addr=127.0.0.1:9050"}, legacy: true},
		{args: []string{"start", "--web", "web/dist"}, legacy: true},
		{args: []string{"open"}, route: "open"},
		{args: []string{"server", "start", "--open"}, route: "server start"},
		{args: []string{"server", "run"}, route: "server run"},
		{args: []string{"server", "stop"}, route: "server stop"},
		{args: []string{"plugin", "disable"}, route: "plugin disable"},
		{args: []string{"start", "codex"}, route: "start <ai>"},
		{args: []string{"start", "claude", "--", "--model", "sonnet"}, route: "start <ai> <args>", aiArgs: []string{"--model", "sonnet"}},
	}
	for _, tc := range tests {
		if got := legacyStart(tc.args); got != tc.legacy {
			t.Errorf("legacyStart(%q) = %t, want %t", tc.args, got, tc.legacy)
		}
		if tc.legacy {
			continue
		}
		var commands cli
		parser, err := kong.New(&commands, kong.Vars{"addr": DefaultAddr})
		if err != nil {
			t.Fatal(err)
		}
		ctx, err := parser.Parse(tc.args)
		if err != nil {
			t.Errorf("parse %q: %v", tc.args, err)
			continue
		}
		if got := ctx.Command(); got != tc.route {
			t.Errorf("parse %q = %q, want %q", tc.args, got, tc.route)
		}
		if tc.args[0] == "start" {
			want := append(tc.aiArgs, "--", startPrompt)
			if got := commands.Start.launchArgs(); !slices.Equal(got, want) {
				t.Errorf("parse %q forwarded %q, want %q", tc.args, got, want)
			}
		}
		if slices.Equal(tc.args, []string{"server", "start", "--open"}) && !commands.Server.Start.Open {
			t.Error("server start --open did not request the browser")
		}
	}
}
