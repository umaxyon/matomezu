package server

import (
	"testing"
	"time"

	"github.com/umaxyon/matomezu/internal/engine"
)

// 時点の無いアクション（AI やホストが頼んだ物）には、ホストが同じ時点から時点と利用者の暦の日付を入れる。画面が決めた時点と日付はそのまま
func TestStampedGivesNowAndTodayFromOneInstant(t *testing.T) {
	was := time.Local
	time.Local = time.FixedZone("JST", 9*60*60)
	t.Cleanup(func() { time.Local = was })
	// UTC では 11/18、利用者の暦（JST）では 11/19
	at := time.Date(2026, 11, 18, 23, 30, 0, 0, time.UTC)
	window := engine.BulkAction{Action: "w", Now: "2026-11-01T00:00:00.000Z", Today: "2026-11-02"}
	ai := engine.BulkAction{Action: "ai"}
	actions := []engine.BulkAction{window, ai}
	got := stamped(actions, at)
	if got[0].Now != window.Now || got[0].Today != window.Today {
		t.Fatalf("the window's action changed: %+v", got[0])
	}
	if got[1].Now != "2026-11-18T23:30:00.000Z" || got[1].Today != "2026-11-19" {
		t.Fatalf("stamped %q %q", got[1].Now, got[1].Today)
	}
	if actions[1].Now != "" || actions[1].Today != "" {
		t.Fatalf("the given actions changed: %+v", actions[1])
	}
	if d := localDate(at); d != "2026-11-19" {
		t.Fatalf("localDate %q", d)
	}
}
