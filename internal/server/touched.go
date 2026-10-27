package server

// ブックに触れた時刻: ブックの id ごとの、開いたか書いた時刻の新しい方（画面がブックを選ぶ一覧の並びと「〜前」に使う）。
// 開いたのは、窓が見ているものを知らせたとき（そのブックを開いているステージがある）。書いたのは、ブックを置いたとき。
// 置き場所に残し、変わったら画面に知らせる（touched）。開いた時刻は、同じブックなら openEvery に 1 度だけ残す（窓の知らせのたびに書かない）

import (
	"encoding/json"
	"fmt"
	"os"
	"time"

	"github.com/umaxyon/matomezu/internal/storage"
)

// openEvery は、同じブックの開いた時刻を残し直すまでの間（「〜前」は 1 分刻みなので、それより細かく残さない）
const openEvery = time.Minute

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

// opened は、窓が知らせた見ているもの view で開いているブックの、開いた時刻を残す（h.mu を持って呼ぶ）
func (h *Hub) opened(view json.RawMessage) {
	var v struct {
		Book   string `json:"book"`
		Stages []struct {
			Book string `json:"book"`
		} `json:"stages"`
	}
	if json.Unmarshal(view, &v) != nil {
		return
	}
	ids := []string{v.Book}
	for _, s := range v.Stages {
		ids = append(ids, s.Book)
	}
	for _, id := range ids {
		if id == "" {
			continue
		}
		if last, err := time.Parse(time.RFC3339Nano, h.touched[id]); err == nil && time.Since(last) < openEvery {
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
