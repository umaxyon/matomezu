package server

// 編集前のロック: 画面は、利用者が直している物（伝言など）の id を、ブックごとに常駐に知らせる（POST /api/view の locks）。
// AI のアクションが、どこかの窓がロックしている物を変えるか消すなら、何も変えずに断る（being-edited）。利用者のアクションは断らない。
// 物は、ブックのデータとアノテーションの中の、その id を持つ所（中の物も含めて）で比べる。窓が離れたら、その窓のロックは解ける

import (
	"encoding/json"
	"slices"

	"github.com/umaxyon/matomezu/internal/engine"
)

// touchesLocked は、アクションの結果 out が、どこかの窓がロックしている物を変えるか消すか（h.mu を持って呼ぶ）
func (h *Hub) touchesLocked(out engine.Output) bool {
	for _, c := range h.clients {
		for book, ids := range c.locks {
			if len(ids) > 0 && h.changesIn(book, ids, out) {
				return true
			}
		}
	}
	return false
}

// changesIn は、アクションの結果 out で、ブック book の物 ids のどれかが変わるか消えるか（h.mu を持って呼ぶ）
func (h *Hub) changesIn(book string, ids []string, out engine.Output) bool {
	before := map[string]string{}
	if e, ok := h.books[book]; ok {
		objectsByID(e.body, before)
	}
	objectsByID(h.annotations[book], before)
	if slices.Contains(out.Removed, book) {
		return slices.ContainsFunc(ids, func(id string) bool { _, ok := before[id]; return ok })
	}
	after := map[string]string{}
	body, bookChanged := bookIn(out.Books, book)
	if !bookChanged {
		if e, ok := h.books[book]; ok {
			body = e.body
		}
	}
	objectsByID(body, after)
	if list, ok := out.Annotations[book]; ok {
		objectsByID(list, after)
	} else {
		objectsByID(h.annotations[book], after)
	}
	for _, id := range ids {
		if was, ok := before[id]; ok && after[id] != was {
			return true
		}
	}
	return false
}

// bookIn は、ブックのデータの並び bodies のうち、id が book のもの
func bookIn(bodies []json.RawMessage, book string) (json.RawMessage, bool) {
	for _, body := range bodies {
		var head struct {
			ID string `json:"id"`
		}
		_ = json.Unmarshal(body, &head)
		if head.ID == book {
			return body, true
		}
	}
	return nil, false
}

// objectsByID は、JSON の値 raw の中の、文字列の id を持つ物（オブジェクト）を、id → 中身（キーをそろえて書き直したもの）として into に足す
func objectsByID(raw json.RawMessage, into map[string]string) {
	if len(raw) == 0 {
		return
	}
	var v any
	if json.Unmarshal(raw, &v) != nil {
		return
	}
	var walk func(v any)
	walk = func(v any) {
		switch x := v.(type) {
		case []any:
			for _, e := range x {
				walk(e)
			}
		case map[string]any:
			if id, ok := x["id"].(string); ok {
				b, _ := json.Marshal(x)
				into[id] = string(b)
			}
			for _, e := range x {
				walk(e)
			}
		}
	}
	walk(v)
}
