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
// ただし開いているステージエントリ（held）には含める。held はブックもブックの外のページ・バインダも持ち、開いた時刻を残すのはブックだけ
func (h *Hub) opened(c *client, view json.RawMessage) {
	var v struct {
		screen
		Hidden *screen `json:"hidden"`
	}
	if json.Unmarshal(view, &v) != nil {
		return
	}
	shown := v.entries()
	held := shown
	if v.Hidden != nil {
		held = v.Hidden.entries()
	}
	before := c.shown
	c.shown, c.held = booksOf(shown), entryIDs(held)
	for _, id := range c.shown {
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

// screen は、窓が知らせた見ているもののうち、ブックスクリーン 1 つが開いているステージエントリとステージ（何も開いていなければ Entry は nil）
type screen struct {
	Entry  *stageEntry `json:"entry"`
	Stages []struct {
		ID    string      `json:"id"`
		Entry *stageEntry `json:"entry"`
	} `json:"stages"`
	CanSplit bool `json:"canSplit"`
}

// entries は、そのブックスクリーンが開いているステージエントリ（重ねない）
func (s screen) entries() []stageEntry {
	out := []stageEntry{}
	add := func(e *stageEntry) {
		if e != nil && e.ID != "" && !slices.Contains(out, *e) {
			out = append(out, *e)
		}
	}
	add(s.Entry)
	for _, st := range s.Stages {
		add(st.Entry)
	}
	return out
}

// booksOf は、ステージエントリ entries のうち、ブックの id
func booksOf(entries []stageEntry) []string {
	out := []string{}
	for _, e := range entries {
		if e.Kind == "book" {
			out = append(out, e.ID)
		}
	}
	return out
}

// entryIDs は、ステージエントリ entries の id
func entryIDs(entries []stageEntry) []string {
	out := make([]string, len(entries))
	for i, e := range entries {
		out[i] = e.ID
	}
	return out
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
