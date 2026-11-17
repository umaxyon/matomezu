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

// Expire は、時点 now で期限の過ぎたアノテーションを消して知らせる（読めないページの物は消さない）
func (h *Hub) Expire(now time.Time) error {
	h.mu.Lock()
	defer h.mu.Unlock()
	watched := h.watched()
	at := isoTime(now)
	live := map[string]json.RawMessage{}
	for page, body := range h.annotations {
		// 読めないページのアノテーションは、そのまま残す
		if _, unreadable := h.pageWarnings[page]; unreadable {
			continue
		}
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
	// 読めないページには行わない（エンジンが断るだけ）
	pages := slices.DeleteFunc(slices.Sorted(maps.Keys(h.annotations)), func(page string) bool {
		_, unreadable := h.pageWarnings[page]
		return unreadable
	})
	h.mu.Unlock()
	for _, page := range pages {
		for _, id := range ids {
			if _, err := h.Perform(Perform{Action: id, Args: json.RawMessage("{}"), On: &engine.On{Page: page}, Now: isoTime(now)}); err != nil {
				return err
			}
		}
	}
	return nil
}
