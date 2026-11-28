package main

import (
	"strings"
	"testing"

	claudelaunch "github.com/umaxyon/matomezu/clients/claude-code/launch"
	"github.com/umaxyon/matomezu/internal/server"
)

// Claude Code の会話の記録から matomezu のフックの文を見分ける頭（claudelaunch.MatomezuHookTexts）は、常駐が AI に伝える文（server.TalkTexts）の頭の写し。
// 常駐の文はどれもいずれかの頭で始まり、"matomezu" のほかの頭はどれも常駐の文の頭に合う
func TestMatomezuHookTextsFollowTheServer(t *testing.T) {
	texts := server.TalkTexts()
	for _, text := range texts {
		found := false
		for _, head := range claudelaunch.MatomezuHookTexts {
			found = found || strings.HasPrefix(text, head)
		}
		if !found {
			t.Errorf("no head in MatomezuHookTexts starts %q", text)
		}
	}
	for _, head := range claudelaunch.MatomezuHookTexts {
		if head == "matomezu" {
			continue
		}
		found := false
		for _, text := range texts {
			found = found || strings.HasPrefix(text, head)
		}
		if !found {
			t.Errorf("head %q starts no text of the server", head)
		}
	}
}
