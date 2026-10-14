package server

// マスターページ（D26 の段階 2。docs/UI-plan.md）のための API。
//
//	GET  /api/books?from=0&limit=10  登録した図を最終更新の新しい順に並べ、from 番目から limit 件を返す
//	                                 {"books": [{"id", "name", "title", "mtime", "madeBy", "pattern"}], "total"}
//	GET  /api/master                 マスター用のファイル（状態のフォルダの master.json）を登録して {"id"} を返す。無ければ作る
//
// 一覧はマスターを開いたとき（新しい 10 件）と、「その他のブック」を開いたとき（残り）に取りに来る。
// サーバーが覚えているのは図のパスだけなので（hub.go の recent）、題名・作った人・パターンは、そのつどファイルを読んで返す。
// フルパスは返さない（ファイルの名前だけ）。マスター用のファイルは一覧に入れず、覚えている図（recent）にも足さない。

import (
	"encoding/json"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strconv"
)

// masterName は状態のフォルダに置くマスター用のファイルの名前
const masterName = "master.json"

// masterBody は、マスター用のファイルが無いときに作る中身（パターンはマスター。窓は画面が開くたびに並べ直す）
const masterBody = "{\n  \"world\": { \"childView\": \"master\" },\n  \"nodes\": []\n}\n"

// BookInfo はブックの一覧の 1 行
type BookInfo struct {
	ID      string `json:"id"`
	Name    string `json:"name"`    // ファイルの名前
	Title   string `json:"title"`   // world.title（無ければ ""）
	MTime   int64  `json:"mtime"`   // 最終更新（ミリ秒）
	MadeBy  string `json:"madeBy"`  // world.madeBy（画面の「新しい図」で作ったブックは "user"。無ければ "" で LLM が渡したもの）
	Pattern string `json:"pattern"` // 最初のページのパターン（world.childView。無ければ "nest"）
}

// masterPath はマスター用のファイルのパス（状態のフォルダが無ければ ""）
func (h *Hub) masterPath() string {
	if h.store == "" {
		return ""
	}
	return filepath.Join(filepath.Dir(h.store), masterName)
}

// bookList は登録した図を最終更新の新しい順に並べる（ファイルが無いものとマスター用のファイルは除く）
func (h *Hub) bookList() []BookInfo {
	h.mu.Lock()
	paths := append([]string(nil), h.recent...)
	h.mu.Unlock()
	master := h.masterPath()
	out := make([]BookInfo, 0, len(paths))
	for _, p := range paths {
		if p == master {
			continue
		}
		st, err := os.Stat(p)
		if err != nil || st.IsDir() {
			continue
		}
		b := BookInfo{ID: docID(p), Name: filepath.Base(p), MTime: st.ModTime().UnixMilli(), Pattern: "nest"}
		if raw, err := os.ReadFile(p); err == nil {
			var head struct {
				World struct {
					Title     any `json:"title"`
					MadeBy    any `json:"madeBy"`
					ChildView any `json:"childView"`
				} `json:"world"`
			}
			if json.Unmarshal(raw, &head) == nil {
				if s, ok := head.World.Title.(string); ok {
					b.Title = s
				}
				if s, ok := head.World.MadeBy.(string); ok {
					b.MadeBy = s
				}
				if s, ok := head.World.ChildView.(string); ok && s != "" {
					b.Pattern = s
				}
			}
		}
		out = append(out, b)
	}
	sort.SliceStable(out, func(i, j int) bool { return out[i].MTime > out[j].MTime })
	return out
}

func (h *Hub) books(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	from, _ := strconv.Atoi(q.Get("from"))
	limit, err := strconv.Atoi(q.Get("limit"))
	if err != nil || limit <= 0 {
		limit = storeLimit
	}
	all := h.bookList()
	from = max(0, min(from, len(all)))
	end := min(len(all), from+limit)
	writeJSON(w, map[string]any{"books": all[from:end], "total": len(all)})
}

// master はマスター用のファイルを登録して id を返す。覚えている図（recent）には足さない（一覧に出さず、新しいブックの置き場所にも使わない）
func (h *Hub) master(w http.ResponseWriter, _ *http.Request) {
	p := h.masterPath()
	if p == "" {
		http.Error(w, "no state folder for the master file", http.StatusNotFound)
		return
	}
	if _, err := os.Stat(p); os.IsNotExist(err) {
		if err := os.MkdirAll(filepath.Dir(p), 0o700); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		if err := writeAtomic(p, []byte(masterBody)); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
	}
	id := docID(p)
	h.mu.Lock()
	if h.docs[id] == nil {
		d, err := newDoc(p, h.versionChanged)
		if err != nil {
			h.mu.Unlock()
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		h.docs[id] = d
	}
	h.mu.Unlock()
	writeJSON(w, map[string]string{"id": id})
}
