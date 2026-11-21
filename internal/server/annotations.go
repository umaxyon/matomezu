package server

// アノテーションを持つ: 確かめる・ページごとに引く・置き場所に書く・窓に知らせる

import (
	"encoding/json"
	"fmt"
	"maps"
	"os"
	"slices"

	"github.com/umaxyon/matomezu/internal/engine"
	"github.com/umaxyon/matomezu/internal/storage"
)

// checkAnnotations は全部のアノテーションを今のプラグインで確かめ、効かないもの（種類が無い・形が合わない）の warning の一覧を直す。
// 新しい warning は常駐のログに書く（h.mu を持って呼ぶ）
func (h *Hub) checkAnnotations() error {
	pairs := []engine.Annotated{}
	for _, id := range h.order {
		if lists := h.annotationsIn(id); len(lists) > 0 {
			pairs = append(pairs, engine.AnnotatedBook(h.books[id].body, lists))
		}
	}
	lines := []string{}
	if len(pairs) > 0 {
		found, err := h.engine.CheckAnnotations(pairs)
		if err != nil {
			return err
		}
		lines = found
	}
	for _, line := range lines {
		if !slices.Contains(h.annotationWarnings, line) {
			fmt.Fprintln(os.Stderr, "warning:", line)
		}
	}
	h.annotationWarnings = lines
	return nil
}

// annotationsIn は、ブック book のページのうち、アノテーションの有るページの id → その並び（h.mu を持って呼ぶ）
func (h *Hub) annotationsIn(book string) map[string]json.RawMessage {
	out := map[string]json.RawMessage{}
	for _, page := range h.books[book].pages {
		if list, ok := h.annotations[page]; ok {
			out[page] = list
		}
	}
	return out
}

// putAnnotationLists は、ページごとのアノテーションの並び lists を 1 つのまとまりで書いて持ち、窓に知らせる（h.mu を持って呼ぶ）
func (h *Hub) putAnnotationLists(lists map[string]json.RawMessage) error {
	if len(lists) == 0 {
		return nil
	}
	batch := storage.Batch{}
	pages := slices.Sorted(maps.Keys(lists))
	for _, page := range pages {
		batch.Annotations = append(batch.Annotations, storage.PageBody{Page: page, Body: lists[page]})
	}
	if err := h.store.Apply(batch); err != nil {
		return err
	}
	for _, page := range pages {
		h.applyAnnotations(page, lists[page])
	}
	return nil
}

// applyAnnotations は、書き終えたページ page のアノテーションの並びを持ち、窓に知らせる（h.mu を持って呼ぶ）
func (h *Hub) applyAnnotations(page string, body json.RawMessage) {
	body = h.holdAnnotations(page, body)
	h.broadcast("annotations", map[string]any{"page": page, "annotations": body})
}

// holdAnnotations は、書き終えたページ page のアノテーションの並びを持ち、窓に知らせる並びを返す（空の並びなら消して "[]"。h.mu を持って呼ぶ）
func (h *Hub) holdAnnotations(page string, body json.RawMessage) json.RawMessage {
	var list []json.RawMessage
	if json.Unmarshal(body, &list) == nil && len(list) == 0 {
		delete(h.annotations, page)
		return json.RawMessage("[]")
	}
	h.annotations[page] = body
	return body
}
