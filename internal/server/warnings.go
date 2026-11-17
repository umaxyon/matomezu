package server

// warning を 1 か所に集める: 定義の warning（エンジンが台帳アセンブルで見つけたもの）・warning のあるブック・効かないアノテーション・窓が見つけて知らせた warning（窓ごと）。
// warning は「その組み合わせ（プラグイン・ブック・UI マッピング）である間ずっと成り立つ問題」なので、今の一覧として持つ（一度きりの出来事は持たない）。
// 常駐のログには変わったときに書き、AI には MCP 公開ツールの actions が返す物の warnings として見せる

import (
	"encoding/json"
	"fmt"
	"maps"
	"os"
	"slices"
)

// SetWindowWarnings は窓 clientID が見つけた warning（{code, plugin, params} の並び）を、その窓の分として入れ替える。
// 文はエンジンが warning の表から作り（表に無い番号は捨てる）、前に無かった 1 行をログに書く。知らない窓なら false
func (h *Hub) SetWindowWarnings(clientID string, warnings json.RawMessage) (bool, error) {
	lines, err := h.engine.WarningLines(warnings)
	if err != nil {
		return false, err
	}
	h.mu.Lock()
	defer h.mu.Unlock()
	if _, ok := h.clients[clientID]; !ok {
		return false, nil
	}
	before := h.windowWarnings[clientID]
	for _, l := range lines {
		if !slices.Contains(before, l) {
			fmt.Fprintln(os.Stderr, "warning:", l)
		}
	}
	h.windowWarnings[clientID] = lines
	return true, nil
}

// pageWarningLines は、ブック id の読めないページの warning の 1 行ずつ（同じ理由のページは同じ 1 行なので、1 つにする）。
// pages は、読めないページの id を並べた物（h.mu を持って呼ぶ）
func (h *Hub) pageWarningLines(id string, pages []string) []string {
	var out []string
	for _, page := range pages {
		if n := h.pageWarnings[page]; n.Book == id && !slices.Contains(out, n.Warning) {
			out = append(out, n.Warning)
		}
	}
	return out
}

// UnreadablePageLines は、読めないページを持つブックの id → その warning の 1 行ずつ
func (h *Hub) UnreadablePageLines() map[string][]string {
	h.mu.Lock()
	defer h.mu.Unlock()
	pages := slices.Sorted(maps.Keys(h.pageWarnings))
	out := map[string][]string{}
	for _, page := range pages {
		id := h.pageWarnings[page].Book
		if _, ok := out[id]; !ok {
			out[id] = h.pageWarningLines(id, pages)
		}
	}
	return out
}

// Warnings は今の warning の 1 行ずつ: 定義の warning、書庫の木の決まりが破れている warning、warning のあるブック（ブックの並びの順に、ブックの warning、読めないページの warning をページの id の順）、
// 効かないアノテーション、窓が見つけた warning（同じ 1 行は 1 つ）
func (h *Hub) Warnings() []string {
	h.mu.Lock()
	defer h.mu.Unlock()
	out := slices.Clone(h.engine.Warnings())
	if h.libraryWarning != "" {
		out = append(out, h.libraryWarning)
	}
	pages := slices.Sorted(maps.Keys(h.pageWarnings))
	for _, id := range h.order {
		if n, ok := h.bookWarnings[id]; ok {
			out = append(out, n.Warning)
		}
		out = append(out, h.pageWarningLines(id, pages)...)
	}
	out = append(out, h.annotationWarnings...)
	out = append(out, h.recordWarningLines()...)
	ids := make([]string, 0, len(h.windowWarnings))
	for id := range h.windowWarnings {
		ids = append(ids, id)
	}
	slices.Sort(ids)
	for _, id := range ids {
		for _, l := range h.windowWarnings[id] {
			if !slices.Contains(out, l) {
				out = append(out, l)
			}
		}
	}
	return out
}

// withWarnings は MCP 公開ツールの actions が返す物に、今の warning（warnings）を添える（無ければそのまま）
func withWarnings(catalog json.RawMessage, warnings []string) json.RawMessage {
	if len(warnings) == 0 {
		return catalog
	}
	var fields map[string]json.RawMessage
	if json.Unmarshal(catalog, &fields) != nil {
		return catalog
	}
	list, err := json.Marshal(warnings)
	if err != nil {
		return catalog
	}
	fields["warnings"] = list
	out, err := json.Marshal(fields)
	if err != nil {
		return catalog
	}
	return out
}
