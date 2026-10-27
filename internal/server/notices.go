package server

// 注意を 1 か所に集める: 定義の注意（エンジンが組み立てで見つけたもの）・注意のあるブック・画面が見つけて知らせた注意（窓ごと）。
// 注意は「その組み合わせ（プラグイン・ブック・配置）である間ずっと成り立つ問題」なので、今の一覧として持つ（一度きりの出来事は持たない）。
// 常駐のログには変わったときに書き、AI には機能台帳の notices として見せる

import (
	"encoding/json"
	"fmt"
	"os"
	"slices"
)

// SetScreenNotices は画面 clientID が見つけた注意（{code, plugin, params} の並び）を、その画面の分として入れ替える。
// 文はエンジンが注意の表から作り（表に無い番号は捨てる）、前に無かった 1 行をログに書く。知らない画面なら false
func (h *Hub) SetScreenNotices(clientID string, notices json.RawMessage) (bool, error) {
	lines, err := h.engine.NoticeLines(notices)
	if err != nil {
		return false, err
	}
	h.mu.Lock()
	defer h.mu.Unlock()
	if _, ok := h.clients[clientID]; !ok {
		return false, nil
	}
	before := h.screenNotices[clientID]
	for _, l := range lines {
		if !slices.Contains(before, l) {
			fmt.Fprintln(os.Stderr, "notice:", l)
		}
	}
	h.screenNotices[clientID] = lines
	return true, nil
}

// Notices は今の注意の 1 行ずつ: 定義の注意、注意のあるブック（ブックの並びの順）、画面が見つけた注意（同じ 1 行は 1 つ）
func (h *Hub) Notices() []string {
	h.mu.Lock()
	defer h.mu.Unlock()
	out := slices.Clone(h.engine.Notices())
	for _, id := range h.order {
		if n, ok := h.bookNotices[id]; ok {
			out = append(out, n.Notice)
		}
	}
	ids := make([]string, 0, len(h.screenNotices))
	for id := range h.screenNotices {
		ids = append(ids, id)
	}
	slices.Sort(ids)
	for _, id := range ids {
		for _, l := range h.screenNotices[id] {
			if !slices.Contains(out, l) {
				out = append(out, l)
			}
		}
	}
	return out
}

// withNotices は AI 向けの機能台帳に、今の注意（notices）を添える（無ければそのまま）
func withNotices(catalog json.RawMessage, notices []string) json.RawMessage {
	if len(notices) == 0 {
		return catalog
	}
	var fields map[string]json.RawMessage
	if json.Unmarshal(catalog, &fields) != nil {
		return catalog
	}
	list, err := json.Marshal(notices)
	if err != nil {
		return catalog
	}
	fields["notices"] = list
	out, err := json.Marshal(fields)
	if err != nil {
		return catalog
	}
	return out
}
