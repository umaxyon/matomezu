package server

import (
	"encoding/json"
	"fmt"
	"maps"
	"os"
	"slices"
)

// 窓が中身を持つ物（M-0263）: 窓は、中身を持つステージエントリを名乗る（POST /api/keep）。常駐は、名乗った窓には、その中のページだけを中身ごと知らせ、
// ほかのページはページメタだけにして知らせる（changed の pages）。名乗っていない窓には、全部を中身ごと知らせる

// Keep は、窓 id が中身を持つステージエントリを entries にし、その中の全部のページの行（中身ごと。{"id", "page", "version"}）を返す
// （名乗りと行を同じ排他で決めるので、返した行より後の変更は、中身ごと知らせる）。知らない窓なら ok が false
func (h *Hub) Keep(id string, entries []string) (pages []map[string]any, ok bool) {
	h.mu.Lock()
	defer h.mu.Unlock()
	c, ok := h.clients[id]
	if !ok {
		return nil, false
	}
	c.kept = make(map[string]bool, len(entries))
	for _, e := range entries {
		c.kept[e] = true
	}
	pages = []map[string]any{}
	for _, page := range slices.Sorted(maps.Keys(h.pages)) {
		if h.keeps(c, page) {
			r := h.pages[page]
			pages = append(pages, map[string]any{"id": page, "page": r.body, "version": r.version})
		}
	}
	return pages, true
}

// keeps は、窓 c が、ページ page の中身を持つか: 名乗っていないか、ページか、それを入れているフォルダのどれかを名乗った（h.mu を持って呼ぶ）
func (h *Hub) keeps(c *client, page string) bool {
	if c.kept == nil || c.kept[page] {
		return true
	}
	for _, at := range h.foldersAbove(page) {
		if c.kept[at] {
			return true
		}
	}
	return false
}

// pagesFor は、窓 c に知らせるページの行 notices（rowNotice の形）: 中身を持たないページは、ページメタだけ（{"id", "page": ページメタ, "version"}。消したページはそのまま。h.mu を持って呼ぶ）
func (h *Hub) pagesFor(c *client, notices []map[string]any) []map[string]any {
	if c.kept == nil {
		return notices
	}
	out := make([]map[string]any, len(notices))
	for i, n := range notices {
		id, _ := n["id"].(string)
		body, has := n["page"].(json.RawMessage)
		if !has || h.keeps(c, id) {
			out[i] = n
			continue
		}
		out[i] = map[string]any{"id": id, "page": h.pageMeta(body), "version": n["version"]}
	}
	return out
}

// pageMeta は、ページの行 body のページメタだけの行（ページメタのフィールドと、中身を持っていない印 "unheld": true。core/folders.ts の pageMetaRowOf と同じ。h.mu を持って呼ぶ）
func (h *Hub) pageMeta(body json.RawMessage) json.RawMessage {
	var all map[string]json.RawMessage
	if err := json.Unmarshal(body, &all); err != nil {
		return body
	}
	meta := map[string]json.RawMessage{"unheld": json.RawMessage("true")}
	for _, k := range h.metaKeys() {
		if v, ok := all[k]; ok {
			meta[k] = v
		}
	}
	out, _ := json.Marshal(meta)
	return out
}

// metaKeys は、ページメタのフィールドの名前（ホストのエンジンから読み、覚えておく。h.mu を持って呼ぶ）
func (h *Hub) metaKeys() []string {
	if h.pageMetaKeys == nil {
		keys, err := h.engine.PageMetaKeys()
		if err != nil {
			fmt.Fprintln(os.Stderr, stamp(), "the page meta keys cannot be read:", err)
			return nil
		}
		h.pageMetaKeys = keys
	}
	return h.pageMetaKeys
}

// broadcastChanged は、changed の知らせ event を、窓ごとに、中身を持たないページをページメタだけにして送る（h.mu を持って呼ぶ）
func (h *Hub) broadcastChanged(event map[string]any) {
	pages, _ := event["pages"].([]map[string]any)
	for _, c := range h.clients {
		if c.kept == nil {
			h.send(c, "changed", event)
			continue
		}
		own := make(map[string]any, len(event))
		for k, v := range event {
			own[k] = v
		}
		own["pages"] = h.pagesFor(c, pages)
		h.send(c, "changed", own)
	}
}
