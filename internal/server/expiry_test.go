package server

import (
	"testing"
	"time"

	"github.com/umaxyon/matomezu/internal/engine"
)

// 続けて決める時点は、時計が後ろへ戻っても同じ時点でも、前の時点の 1ms 後になり、時計が前の時点を越えたら時計のまま（ミリ秒まで）
func TestLaterThanNeverGoesBack(t *testing.T) {
	t.Parallel()
	last := time.Date(2026, 11, 18, 1, 0, 10, 0, time.UTC)
	ms := time.Millisecond
	for _, c := range []struct{ now, want time.Time }{
		{last.Add(-1600 * ms), last.Add(ms)},
		{last, last.Add(ms)},
		{last.Add(500 * time.Microsecond), last.Add(ms)},
		{last.Add(2*ms + 300*time.Microsecond), last.Add(2 * ms)},
	} {
		if got := laterThan(last, c.now); !got.Equal(c.want) {
			t.Fatalf("laterThan(%v, %v) = %v, want %v", last, c.now, got, c.want)
		}
	}
}

// 時点の無いアクション（AI やホストが頼んだ物）には、ホストが同じ時点から時点と利用者の暦の日付を入れる。画面が決めた時点と日付はそのまま
func TestStampedGivesNowAndTodayFromOneInstant(t *testing.T) {
	serial(t, "time.Local を書き換える")
	was := time.Local
	time.Local = time.FixedZone("JST", 9*60*60)
	cleanup(t, func() { time.Local = was })
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
