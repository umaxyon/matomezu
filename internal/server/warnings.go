package server

// warning を 1 か所に集める: 定義の warning（エンジンが台帳アセンブルで見つけたもの）・warning のあるブック・効かないアノテーションとレコード・書庫の木の決まりの破れ・読めない物・書庫を整える失敗・窓が見つけて知らせた warning（窓ごと）。
// 確かめるのはそれぞれの持ち主（annotations.go・records.go・tables.go・unreadable.go）で、ここは結果を持ってログに書き、一覧にする。
// warning は「その組み合わせ（プラグイン・ブック・UI マッピング）である間ずっと成り立つ問題」なので、今の一覧として持つ（一度きりの出来事は持たない）。
// 常駐のログには変わったときに書き、AI には MCP 公開ツールの actions が返す物の warnings として見せる

import (
	"encoding/json"
	"fmt"
	"maps"
	"os"
	"slices"

	"github.com/umaxyon/matomezu/internal/engine"
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

// Warnings は今の warning の 1 行ずつ: 定義の warning、書庫の木の決まりが破れている warning、読めない物のフォルダの warning、書庫を整えるのに失敗している warning、warning のあるブック（ブックの並びの順）、
// 効かないアノテーション、窓が見つけた warning（同じ 1 行は 1 つ）
func (h *Hub) Warnings() []string {
	h.mu.Lock()
	defer h.mu.Unlock()
	out := slices.Clone(h.engine.Warnings())
	if h.libraryWarning != "" {
		out = append(out, h.libraryWarning)
	}
	// 読めない物のフォルダに移った物は、1 つずつの warning を出さず、件数の warning 1 つだけ
	if h.unreadableWarning != "" {
		out = append(out, h.unreadableWarning)
	}
	if h.settleWarning != "" {
		out = append(out, h.settleWarning)
	}
	for _, id := range h.order {
		if h.inUnreadable(id) {
			continue
		}
		if n, ok := h.bookWarnings[id]; ok {
			out = append(out, n.Warning)
		}
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

// recordWarnings は、ブック ids を確かめた結果 found を一覧に持つ（変わった warning はログに書く。h.mu を持って呼ぶ）
func (h *Hub) recordWarnings(ids []string, found []engine.BookWarning) {
	before := map[string]bool{}
	for _, id := range ids {
		if n, ok := h.bookWarnings[id]; ok {
			before[n.Warning] = true
		}
		delete(h.bookWarnings, id)
	}
	for _, n := range found {
		h.bookWarnings[n.Book] = n
		if !before[n.Warning] {
			fmt.Fprintln(os.Stderr, "warning:", n.Warning)
			before[n.Warning] = true
		}
	}
}

// BookWarnings は warning のあるブックの id → そのブックの warning（読めない物のフォルダに移ったブックは入らない）
func (h *Hub) BookWarnings() map[string]engine.BookWarning {
	h.mu.Lock()
	defer h.mu.Unlock()
	out := maps.Clone(h.bookWarnings)
	maps.DeleteFunc(out, func(id string, _ engine.BookWarning) bool { return h.inUnreadable(id) })
	return out
}

// recordWarningLines は、効かないレコードの warning の 1 行ずつ（種類の id、レコードの id の順。h.mu を持って呼ぶ）
func (h *Hub) recordWarningLines() []string {
	keys := slices.SortedFunc(maps.Keys(h.recordLines), func(a, b recordKey) int {
		if c := compareStrings(a.subject, b.subject); c != 0 {
			return c
		}
		return compareStrings(a.id, b.id)
	})
	out := []string{}
	for _, k := range keys {
		out = append(out, h.recordLines[k]...)
	}
	return out
}

// holdSettleFailure は、書庫を整えるのに訳 reason（"engine"・"broken"・"write"。err はその誤り、無ければ nil）で失敗した事の warning（W033）を持つ。
// 変わったときは、常駐のログに warning と誤りを書く（h.mu を持って呼ぶか、起動の途中で呼ぶ）
func (h *Hub) holdSettleFailure(reason string, err error) {
	line, lineErr := h.engine.SettleFailed(reason)
	if lineErr != nil {
		// 文の表はエンジンの中だけに在るので、引けなければ番号と訳の鍵だけを持つ
		fmt.Fprintln(os.Stderr, "engine: could not make the warning W033:", lineErr)
		line = "W033 : " + reason
	}
	if holdLine(&h.settleWarning, line) && err != nil {
		fmt.Fprintln(os.Stderr, "  ", err)
	}
}

// holdLine は、warning の 1 行 line（無ければ空）を held に持ち、空でなく前と変わったときは常駐のログに書く（書いたなら true。held を持つ物の鍵は呼び手が持つ）
func holdLine(held *string, line string) bool {
	logged := line != "" && line != *held
	if logged {
		fmt.Fprintln(os.Stderr, "warning:", line)
	}
	*held = line
	return logged
}
