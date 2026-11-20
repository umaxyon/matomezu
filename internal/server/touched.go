package server

// ブックに触れた時刻: ブックの id ごとの、開いたか書いた時刻の新しい方（画面がブックを選ぶ一覧の並びと「〜前」に使う）。
// 開いたのは、窓が見ているものを知らせたときに、その窓に新しく見えたブック（前の知らせに無かったもの。出したままのブックは開き直さない）。
// 書いたのは、ブックを置いたとき。置き場所に残し、変わったら窓に知らせる（touched）

import (
	"encoding/json"
	"fmt"
	"os"
	"slices"
	"time"

	"github.com/umaxyon/matomezu/internal/storage"
)

// stamp は今の時刻（置き場所と同じ、桁の決まった形。文字のまま比べられる）
func stamp() string { return storage.Stamp(time.Now()) }

// touch はブック id に触れた時刻を at にして、窓に知らせる（h.mu を持って呼ぶ）
func (h *Hub) touch(id, at string) {
	if h.touched[id] >= at {
		return
	}
	h.touched[id] = at
	h.broadcast("touched", map[string]any{"book": id, "at": at})
}

// opened は、窓 c が知らせた見ているもの view に新しく見えたブックの、開いた時刻を残す（h.mu を持って呼ぶ）。
// コントロールセンターがカレントスクリーンの間、後ろに隠れているブックスクリーンのブック（view の hidden）は見えていないので、開いたとしない。
// ただし開いているブック（held）には含める
func (h *Hub) opened(c *client, view json.RawMessage) {
	var v struct {
		screen
		Hidden *screen `json:"hidden"`
	}
	if json.Unmarshal(view, &v) != nil {
		return
	}
	shown := v.books()
	held := shown
	if v.Hidden != nil {
		held = v.Hidden.books()
	}
	before := c.shown
	c.shown, c.held = shown, held
	for _, id := range shown {
		if slices.Contains(before, id) {
			continue
		}
		at := stamp()
		if err := h.store.Open(id, at); err != nil {
			fmt.Fprintln(os.Stderr, "open:", err)
			continue
		}
		h.touch(id, at)
	}
}

// screen は、窓が知らせた見ているもののうち、ブックスクリーン 1 つが開いているブックとステージ
type screen struct {
	Book   string `json:"book"`
	Stages []struct {
		ID   string `json:"id"`
		Book string `json:"book"`
	} `json:"stages"`
	CanSplit bool `json:"canSplit"`
}

// books は、そのブックスクリーンが開いているブックの id（重ねない）
func (s screen) books() []string {
	books := []string{}
	for _, id := range append([]string{s.Book}, s.stageBooks()...) {
		if id != "" && !slices.Contains(books, id) {
			books = append(books, id)
		}
	}
	return books
}

// stageBooks はステージごとの開いているブックの id
func (s screen) stageBooks() []string {
	ids := make([]string, len(s.Stages))
	for i, st := range s.Stages {
		ids[i] = st.Book
	}
	return ids
}

// Touched はブックの id ごとの、触れた時刻
func (h *Hub) Touched() map[string]string {
	h.mu.Lock()
	defer h.mu.Unlock()
	out := make(map[string]string, len(h.touched))
	for id, at := range h.touched {
		out[id] = at
	}
	return out
}
