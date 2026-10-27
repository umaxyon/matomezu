package server

// warning を 1 か所に集める: 定義の warning（エンジンが組み立てで見つけたもの）・warning のあるブック・画面が見つけて知らせた warning（窓ごと）。
// warning は「その組み合わせ（プラグイン・ブック・配置）である間ずっと成り立つ問題」なので、今の一覧として持つ（一度きりの出来事は持たない）。
// 常駐のログには変わったときに書き、AI には MCP 公開ツールの actions が返す物の warnings として見せる

import (
	"encoding/json"
	"fmt"
	"os"
	"slices"
)

// SetScreenWarnings は画面 clientID が見つけた warning（{code, plugin, params} の並び）を、その画面の分として入れ替える。
// 文はエンジンが warning の表から作り（表に無い番号は捨てる）、前に無かった 1 行をログに書く。知らない画面なら false
func (h *Hub) SetScreenWarnings(clientID string, warnings json.RawMessage) (bool, error) {
	lines, err := h.engine.WarningLines(warnings)
	if err != nil {
		return false, err
	}
	h.mu.Lock()
	defer h.mu.Unlock()
	if _, ok := h.clients[clientID]; !ok {
		return false, nil
	}
	before := h.screenWarnings[clientID]
	for _, l := range lines {
		if !slices.Contains(before, l) {
			fmt.Fprintln(os.Stderr, "warning:", l)
		}
	}
	h.screenWarnings[clientID] = lines
	return true, nil
}

// Warnings は今の warning の 1 行ずつ: 定義の warning、warning のあるブック（ブックの並びの順）、画面が見つけた warning（同じ 1 行は 1 つ）
func (h *Hub) Warnings() []string {
	h.mu.Lock()
	defer h.mu.Unlock()
	out := slices.Clone(h.engine.Warnings())
	for _, id := range h.order {
		if n, ok := h.bookWarnings[id]; ok {
			out = append(out, n.Warning)
		}
	}
	ids := make([]string, 0, len(h.screenWarnings))
	for id := range h.screenWarnings {
		ids = append(ids, id)
	}
	slices.Sort(ids)
	for _, id := range ids {
		for _, l := range h.screenWarnings[id] {
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
