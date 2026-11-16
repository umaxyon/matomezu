package main

import (
	"bytes"
	"errors"
	"slices"
	"strings"
	"testing"
)

func TestPluginRemove(t *testing.T) {
	cases := []struct {
		name    string
		ai      []string
		missing string // PATH に無いプログラム
		fails   string // 失敗するコマンド（空白でつないだ物）
		ran     []string
		out     string // 出力に含む物
		wantErr bool
	}{
		{name: "all in order", ran: []string{
			"claude plugin uninstall matomezu@matomezu", "claude plugin marketplace remove matomezu",
			"codex plugin remove matomezu@matomezu", "codex plugin marketplace remove matomezu",
			"opencode plugin remove matomezu-opencode",
		}},
		{name: "only the named", ai: []string{"codex"}, ran: []string{
			"codex plugin remove matomezu@matomezu", "codex plugin marketplace remove matomezu",
		}},
		{name: "skips a program not on PATH", missing: "claude", out: "claude-code: skipped (claude was not found)", ran: []string{
			"codex plugin remove matomezu@matomezu", "codex plugin marketplace remove matomezu",
			"opencode plugin remove matomezu-opencode",
		}},
		{name: "goes on after a failure", ai: []string{"claude-code", "opencode"}, fails: "claude plugin uninstall matomezu@matomezu", wantErr: true, ran: []string{
			"claude plugin uninstall matomezu@matomezu", "claude plugin marketplace remove matomezu",
			"opencode plugin remove matomezu-opencode",
		}},
		{name: "unknown name", ai: []string{"gemini"}, wantErr: true},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			var out bytes.Buffer
			var ran []string
			r := remover{
				out: &out,
				lookPath: func(p string) (string, error) {
					if p == c.missing {
						return "", errors.New("not found")
					}
					return p, nil
				},
				run: func(name string, args ...string) error {
					line := strings.Join(append([]string{name}, args...), " ")
					ran = append(ran, line)
					if line == c.fails {
						return errors.New("exit status 1")
					}
					return nil
				},
			}
			err := r.remove(c.ai)
			if (err != nil) != c.wantErr {
				t.Errorf("err %v, want error %v", err, c.wantErr)
			}
			if !slices.Equal(ran, c.ran) {
				t.Errorf("ran %q, want %q", ran, c.ran)
			}
			if !strings.Contains(out.String(), c.out) {
				t.Errorf("output %q does not contain %q", out.String(), c.out)
			}
		})
	}
}
