package server

// ブックに触れた時刻: ブックの id ごとの、開いたか書いた時刻の新しい方（画面がブックを選ぶ一覧の並びと「〜前」に使う）。
// 開いたのは、窓が見ているものを知らせたときに、その窓に新しく出たブック（前の知らせに無かったもの。出したままのブックは開き直さない）。
// 書いたのは、ブックを置いたとき。置き場所に残し、変わったら画面に知らせる（touched）

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

// touch はブック id に触れた時刻を at にして、画面に知らせる（h.mu を持って呼ぶ）
func (h *Hub) touch(id, at string) {
	if h.touched[id] >= at {
		return
	}
	h.touched[id] = at
	h.broadcast("touched", map[string]any{"book": id, "at": at})
}

// opened は、窓 c が知らせた見ているもの view に新しく出たブックの、開いた時刻を残す（h.mu を持って呼ぶ）
func (h *Hub) opened(c *client, view json.RawMessage) {
	var v struct {
		Book   string `json:"book"`
		Stages []struct {
			Book string `json:"book"`
		} `json:"stages"`
	}
	if json.Unmarshal(view, &v) != nil {
		return
	}
	shown := []string{}
	for _, id := range append([]string{v.Book}, stageBooks(v.Stages)...) {
		if id != "" && !slices.Contains(shown, id) {
			shown = append(shown, id)
		}
	}
	before := c.shown
	c.shown = shown
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

// stageBooks はステージごとの開いているブックの id
func stageBooks(stages []struct {
	Book string `json:"book"`
}) []string {
	ids := make([]string, len(stages))
	for i, s := range stages {
		ids[i] = s.Book
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
