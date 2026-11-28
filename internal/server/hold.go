package server

import (
	"encoding/json"
	"fmt"
	"maps"
	"os"
	"slices"
)

// 窓が中身を持つ物: 窓は、中身を持つステージエントリを名乗る（POST /api/hold）。常駐は、名乗った窓には、その中のページだけを中身ごと知らせ、
// ほかのページはページメタだけにして知らせる（changed の pages）。名乗っていない窓には、全部を中身ごと知らせる

// Hold は、窓 id が中身を持つステージエントリを entries にし、その中の全部のページの行（中身ごと。{"id", "page", "version"}）を返す
// （名乗りと行を同じ排他で決めるので、返した行より後の変更は、中身ごと知らせる）。知らない窓なら ok が false
func (h *Hub) Hold(id string, entries []string) (pages []map[string]any, ok bool) {
	h.mu.Lock()
	defer h.mu.Unlock()
	c, ok := h.clients[id]
	if !ok {
		return nil, false
	}
	c.holding = make(map[string]bool, len(entries))
	for _, e := range entries {
		c.holding[e] = true
	}
	pages = []map[string]any{}
	for _, page := range slices.Sorted(maps.Keys(h.pages)) {
		if h.holds(c, page) {
			r := h.pages[page]
			pages = append(pages, map[string]any{"id": page, "page": r.body, "version": r.version})
		}
	}
	return pages, true
}

// holds は、窓 c が、ページ page の中身を持つか: 名乗っていないか、ページか、それを入れているフォルダのどれかを名乗った（h.mu を持って呼ぶ）
func (h *Hub) holds(c *client, page string) bool {
	if c.holding == nil || c.holding[page] {
		return true
	}
	for _, at := range h.foldersAbove(page) {
		if c.holding[at] {
			return true
		}
	}
	return false
}

// pagesFor は、窓 c に知らせるページの行 notices（rowNotice の形）: 中身を持たないページは、ページメタだけ（{"id", "page": ページメタだけの行, "version"}。消したページはそのまま）。
// metas は、ページの id ごとの、ページメタだけの行（窓の間で分け合い、無ければ作って足す）。h.mu を持って呼ぶ
func (h *Hub) pagesFor(c *client, notices []map[string]any, metas map[string]json.RawMessage) []map[string]any {
	if c.holding == nil {
		return notices
	}
	out := make([]map[string]any, len(notices))
	for i, n := range notices {
		id, _ := n["id"].(string)
		body, has := n["page"].(json.RawMessage)
		if !has || h.holds(c, id) {
			out[i] = n
			continue
		}
		meta, made := metas[id]
		if !made {
			var err error
			if meta, err = h.engine.PageMetaRow(body); err != nil {
				fmt.Fprintln(os.Stderr, stamp(), "the page meta of", id, "cannot be made:", err)
				meta = body
			}
			metas[id] = meta
		}
		out[i] = map[string]any{"id": id, "page": meta, "version": n["version"]}
	}
	return out
}

// broadcastChanged は、changed の知らせ event を、窓ごとに、中身を持たないページをページメタだけにして送る（h.mu を持って呼ぶ）
func (h *Hub) broadcastChanged(event map[string]any) {
	pages, _ := event["pages"].([]map[string]any)
	metas := map[string]json.RawMessage{}
	for _, c := range h.clients {
		if c.holding == nil {
			h.send(c, "changed", event)
			continue
		}
		own := make(map[string]any, len(event))
		for k, v := range event {
			own[k] = v
		}
		own["pages"] = h.pagesFor(c, pages, metas)
		h.send(c, "changed", own)
	}
}
