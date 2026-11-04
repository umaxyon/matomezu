package server

// 期限と話しかけ: 種類の期限（expiresAt）が過ぎたアノテーションを、時間で消す（Expire。窓で利用者が直している物は消さない）。
// 利用者が AI に話しかけたら（AI のフックが POST /api/ai/talked で知らせる）、話しかけたときに行うアクション（runsWhenUserTalks）を、
// アノテーションのあるブックごとに利用者として行う（Talked。伝言なら、読まれた伝言の期限が数え始まる）

import (
	"encoding/json"
	"time"

	"github.com/umaxyon/matomezu/internal/engine"
)

// ExpireEvery は、期限の過ぎたアノテーションを消しに見る間隔
const ExpireEvery = time.Minute

// isoTime は、アクションの時点と同じ書き方の時刻（UTC、ミリ秒まで）
func isoTime(t time.Time) string { return t.UTC().Format("2006-01-02T15:04:05.000Z") }

// Expire は、時点 now で期限の過ぎたアノテーションを消して知らせる
func (h *Hub) Expire(now time.Time) error {
	h.mu.Lock()
	defer h.mu.Unlock()
	watched := h.watched()
	at := isoTime(now)
	for book, body := range h.annotations {
		live, changed, err := h.engine.AnnotationsUnexpired(body, h.settings, at, watched[book])
		if err != nil {
			return err
		}
		if changed {
			if err := h.putAnnotations(book, live, "", 0); err != nil {
				return err
			}
		}
	}
	return nil
}

// Talked は、利用者が AI に話しかけたときに行うアクションを、アノテーションのあるブックごとに行う（変える物の無いブックは、断られるだけで何もしない）
func (h *Hub) Talked(now time.Time) error {
	ids, err := h.engine.TalkActions()
	if err != nil {
		return err
	}
	h.mu.Lock()
	books := make([]string, 0, len(h.annotations))
	for book := range h.annotations {
		books = append(books, book)
	}
	h.mu.Unlock()
	for _, book := range books {
		for _, id := range ids {
			if _, err := h.Perform(Perform{Action: id, Args: json.RawMessage("{}"), On: &engine.On{Book: book}, Now: isoTime(now)}); err != nil {
				return err
			}
		}
	}
	return nil
}
