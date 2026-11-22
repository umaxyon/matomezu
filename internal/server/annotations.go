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

// checkAnnotations は、ブックとブックの外のページ（バインダの中も）のアノテーション（ゴミ箱の中・読めない物は除く。annotatedIn）を今のプラグインで確かめ、効かないもの（種類が無い・形が合わない）の warning の一覧を直す。
// 新しい warning は常駐のログに書く（h.mu を持って呼ぶ）
func (h *Hub) checkAnnotations() error {
	pairs, _ := h.annotatedIn(nil)
	lines := map[string][]string{}
	if len(pairs) > 0 {
		found, err := h.engine.CheckAnnotations(pairs)
		if err != nil {
			return err
		}
		lines = found
	}
	for _, page := range slices.Sorted(maps.Keys(lines)) {
		for _, line := range lines[page] {
			if !slices.Contains(h.annotationWarnings[page], line) {
				fmt.Fprintln(os.Stderr, "warning:", line)
			}
		}
	}
	h.annotationWarnings = lines
	return nil
}

// annotationWarningLines は、効かないアノテーションの warning の 1 行ずつ（ページの id の順。h.mu を持って呼ぶ）
func (h *Hub) annotationWarningLines() []string {
	out := []string{}
	for _, page := range slices.Sorted(maps.Keys(h.annotationWarnings)) {
		out = append(out, h.annotationWarnings[page]...)
	}
	return out
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
		delete(h.annotationWarnings, page)
		return json.RawMessage("[]")
	}
	h.annotations[page] = body
	if len(h.annotationWarnings[page]) > 0 {
		h.recheckAnnotationsOf(page)
	}
	return body
}

// recheckAnnotationsOf は、ページ page のアノテーションだけを確かめ直し、その warning を入れ替える（効かない物が消えたら、その行を外す。
// 確かめられなければ、ログに書いて一覧はそのまま。h.mu を持って呼ぶ）
func (h *Hub) recheckAnnotationsOf(page string) {
	lists := map[string]json.RawMessage{page: h.annotations[page]}
	var pair engine.Annotated
	if book := h.bookOfPage(page); book != "" {
		pair = engine.AnnotatedBook(h.books[book].body, lists)
	} else if h.entryNotInBook(page) != "" {
		pair = engine.AnnotatedPage(h.pages[page].body, lists)
	} else {
		delete(h.annotationWarnings, page)
		return
	}
	found, err := h.engine.CheckAnnotations([]engine.Annotated{pair})
	if err != nil {
		fmt.Fprintln(os.Stderr, "engine: could not check the annotations:", err)
		return
	}
	if lines := found[page]; len(lines) > 0 {
		h.annotationWarnings[page] = lines
	} else {
		delete(h.annotationWarnings, page)
	}
}
