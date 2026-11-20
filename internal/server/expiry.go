package server

// 期限と利用者トリガートーク: 種類の期限（expiresAt）が過ぎたアノテーションを、時間で消す（Expire。窓で利用者が直している物は消さない）。
// 利用者トリガートークがあったら（AI のフックが POST /api/ai/talked で知らせる）、利用者トリガートークのときに行うアクション（runsWhenUserTalks）を、
// アノテーションのあるページごとに利用者として行う（Talked。伝言なら、読まれた伝言の期限が数え始まる）

import (
	"encoding/json"
	"maps"
	"slices"
	"time"

	"github.com/umaxyon/matomezu/internal/engine"
)

// ExpireEvery は、期限の過ぎたアノテーションを消しに見る間隔
const ExpireEvery = time.Minute

// isoTime は、アクションの時点と同じ書き方の時刻（UTC、ミリ秒まで）
func isoTime(t time.Time) string { return t.UTC().Format("2006-01-02T15:04:05.000Z") }

// localDate は、アクションの日付と同じ書き方の、時点 t の利用者（この OS の時間帯）の暦の日付（YYYY-MM-DD）
func localDate(t time.Time) string { return t.In(time.Local).Format("2006-01-02") }

// stamped は、時点の無いアクションに、時点 now とその日付を同じ時点から入れた写し（時点のあるアクションは、そのまま）
func stamped(actions []engine.BulkAction, now time.Time) []engine.BulkAction {
	out := slices.Clone(actions)
	for i := range out {
		if out[i].Now == "" {
			out[i].Now, out[i].Today = isoTime(now), localDate(now)
		}
	}
	return out
}

// Expire は、時点 now で期限の過ぎたアノテーションを消して知らせる
func (h *Hub) Expire(now time.Time) error {
	h.mu.Lock()
	defer h.mu.Unlock()
	watched := h.watched()
	at := isoTime(now)
	live := map[string]json.RawMessage{}
	for page, body := range h.annotations {
		kept, changed, err := h.engine.AnnotationsUnexpired(body, h.settings, at, watched[page])
		if err != nil {
			return err
		}
		if changed {
			live[page] = kept
		}
	}
	return h.putAnnotationLists(live, "", 0)
}

// Talked は、利用者トリガートークのときに行うアクションを、アノテーションのある読めるページごとに行う（変える物の無いページは、断られるだけで何もしない）
func (h *Hub) Talked(now time.Time) error {
	ids, err := h.engine.TalkActions()
	if err != nil {
		return err
	}
	h.mu.Lock()
	if err := h.forgetToldAIEditTickets(); err != nil {
		h.mu.Unlock()
		return err
	}
	// 読めない物のフォルダの中のページには行わない（エンジンが断るだけ）
	pages := slices.DeleteFunc(slices.Sorted(maps.Keys(h.annotations)), h.inUnreadable)
	h.mu.Unlock()
	for _, page := range pages {
		for _, id := range ids {
			if _, err := h.Perform(Perform{Actions: []engine.BulkAction{{Action: id, Args: json.RawMessage("{}"), On: &engine.On{Page: page}, Now: isoTime(now), Today: localDate(now)}}}); err != nil {
				return err
			}
		}
	}
	return nil
}
