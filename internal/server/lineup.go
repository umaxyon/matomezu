package server

// ブック（本文）の並び（lineup）を歩く口。エントリは、ページ（"kind": "page"）か、1 つのタイプのページだけを入れるバインダ（"kind": "binder"。中の並びも lineup）。
// サーバーがブックの本文の中のページを読む・替えるのは、ここを通す（バインダの中のページも、並びの順に歩く）

import (
	"encoding/json"

	"github.com/umaxyon/matomezu/internal/storage"
)

// binderEntry は、並びのバインダ（フィールドの順は保存の形と同じ）
type binderEntry struct {
	Kind     string            `json:"kind"`
	ID       string            `json:"id"`
	Title    string            `json:"title"`
	PageType string            `json:"pageType"`
	Lineup   []json.RawMessage `json:"lineup"`
}

// kindOf は、エントリの kind（読めなければ空）
func kindOf(entry json.RawMessage) string {
	var head struct {
		Kind string `json:"kind"`
	}
	_ = json.Unmarshal(entry, &head)
	return head.Kind
}

// lineupOf は、ブックの本文の並び（読めなければ nil）
func lineupOf(body json.RawMessage) []json.RawMessage {
	var book struct {
		Lineup []json.RawMessage `json:"lineup"`
	}
	if json.Unmarshal(body, &book) != nil {
		return nil
	}
	return book.Lineup
}

// pagesOfBook は、ブックの本文のページ（バインダの中も、並びの順に）
func pagesOfBook(body json.RawMessage) []json.RawMessage {
	out := []json.RawMessage{}
	for _, e := range lineupOf(body) {
		switch kindOf(e) {
		case storage.KindPage:
			out = append(out, e)
		case storage.KindBinder:
			var f binderEntry
			if json.Unmarshal(e, &f) == nil {
				out = append(out, f.Lineup...)
			}
		}
	}
	return out
}

// pageIDs は、ブックの本文のページの id（バインダの中も、並びの順に。id を読めないページは飛ばす）
func pageIDs(body json.RawMessage) []string {
	out := []string{}
	for _, p := range pagesOfBook(body) {
		var head struct {
			ID string `json:"id"`
		}
		if json.Unmarshal(p, &head) == nil && head.ID != "" {
			out = append(out, head.ID)
		}
	}
	return out
}

// mapLineup は、並び entries の要素を替えた並び: ページは page で、バインダは中の並びのページを page で替えてから binder で替える
// （binder が nil ならバインダはそのまま）。読めない要素はそのまま残す
func mapLineup(
	entries []json.RawMessage,
	page func(json.RawMessage) (json.RawMessage, error),
	binder func(binderEntry) (json.RawMessage, error),
) ([]json.RawMessage, error) {
	out := make([]json.RawMessage, 0, len(entries))
	for _, e := range entries {
		switch kindOf(e) {
		case storage.KindPage:
			p, err := page(e)
			if err != nil {
				return nil, err
			}
			out = append(out, p)
		case storage.KindBinder:
			var f binderEntry
			if json.Unmarshal(e, &f) != nil {
				out = append(out, e)
				continue
			}
			inner, err := mapLineup(f.Lineup, page, nil)
			if err != nil {
				return nil, err
			}
			f.Lineup = inner
			if binder != nil {
				made, err := binder(f)
				if err != nil {
					return nil, err
				}
				out = append(out, made)
				continue
			}
			raw, err := json.Marshal(f)
			if err != nil {
				return nil, err
			}
			out = append(out, raw)
		default:
			out = append(out, e)
		}
	}
	return out, nil
}

// withLineup は、ブックの本文の並びを lineup に替えた本文（読めない本文は、そのまま）
func withLineup(body json.RawMessage, lineup []json.RawMessage) (json.RawMessage, error) {
	var book map[string]json.RawMessage
	if json.Unmarshal(body, &book) != nil {
		return body, nil
	}
	raw, err := json.Marshal(lineup)
	if err != nil {
		return nil, err
	}
	book["lineup"] = raw
	return json.Marshal(book)
}
