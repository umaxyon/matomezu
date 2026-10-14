package server

// マスターページ（D26 の段階 2。docs/UI-plan.md）のための API。
//
//	GET  /api/books?from=0&limit=10  登録した図を最終更新の新しい順に並べ、from 番目から limit 件を返す
//	                                 {"books": [{"id", "name", "title", "mtime", "madeBy", "pattern"}], "total"}
//	GET  /api/master                 マスター用のファイル（状態のフォルダの master.json）を登録して {"id"} を返す。無ければ作る
//
// 一覧はマスターを開いたとき（新しい 10 件）と、「その他のブック」を開いたとき（残り）に取りに来る。
// 一覧が変わったら SSE の books イベントで画面に知らせ、マスターを見ている画面は作り直す（ほかのブックと同じく、見ている最中にも反映する。2026-10-15 ユーザー）。
// 変わったとみなすのは、登録したとき（remember）と、マスターを開いている画面があるあいだに登録した図のファイルが変わった・消えたとき（watchBooks）。
// サーバーが覚えているのは図のパスだけなので（hub.go の recent）、題名・作った人・パターンは、そのつどファイルを読んで返す。
// フルパスは返さない（ファイルの名前だけ）。マスター用のファイルは一覧に入れず、覚えている図（recent）にも足さない。

import (
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
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
	h.mu.Lock()
	paths := append([]string(nil), h.recent...)
	h.mu.Unlock()
	sig := booksSignature(paths) // 返す一覧の時点の様子（これより後の変化を知らせる。watchBooks）
	all := h.bookList()
	h.mu.Lock()
	h.booksSig = sig
	h.mu.Unlock()
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
		d, err := h.newDoc(p)
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

// booksChanged はブックの一覧が変わったことを画面に知らせる
func (h *Hub) booksChanged() {
	h.broadcast(event{"books", "{}"})
}

// watchBooks は、マスターを開いている画面があれば、登録した図のファイルの様子（最終更新・大きさ・有無）を調べ、前と違えば知らせる。
// 中身は読まない（Hub の監視が一定間隔で呼ぶので、軽く済ませる）。マスターを開いている画面が無いあいだは調べない
// （覚えた様子は消さない。マスターを開くと一覧を取り直し、そのときの様子を覚え直す）
func (h *Hub) watchBooks() {
	master := docID(h.masterPath())
	h.mu.Lock()
	open := false
	for _, c := range h.clients {
		if c.docs == nil || c.docs[master] {
			open = true
			break
		}
	}
	paths := append([]string(nil), h.recent...)
	prev := h.booksSig
	h.mu.Unlock()
	if !open || h.store == "" {
		return
	}
	sig := booksSignature(paths)
	h.mu.Lock()
	h.booksSig = sig
	h.mu.Unlock()
	// 前の様子が無ければ（一覧を取らずに調べ始めた）知らせない。一覧を返したときに、その時点の様子を覚えている（books）
	if prev != "" && prev != sig {
		h.booksChanged()
	}
}

// booksSignature は登録した図のファイルの様子（パスごとの最終更新・大きさ・有無）。中身は読まない
func booksSignature(paths []string) string {
	var sig strings.Builder
	for _, p := range paths {
		sig.WriteString(p)
		if st, err := os.Stat(p); err == nil && !st.IsDir() {
			fmt.Fprintf(&sig, "|%d|%d\n", st.ModTime().UnixNano(), st.Size())
		} else {
			sig.WriteString("|-\n")
		}
	}
	return sig.String()
}
