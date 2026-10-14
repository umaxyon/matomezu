package server

// LLM の履歴（D31。2026-10-15 ユーザー）。画面の Undo / Redo はユーザーの操作だけを扱い、LLM の変更（matomezu set や、ファイルの直接の
// 書き換え。画面からの保存（PUT api/data）以外の、ファイルの変化）は、ここで別に覚える。状態のフォルダの llm/<図の id>.json に置き、
// サーバーを起動し直しても残る。ブックごとに llmMax 件（古いものから捨てる）。画面でブックを閉じたら消す（DELETE）。
//
//	GET    /d/<id>/api/llm              {"entries": [...]} 古い順
//	POST   /d/<id>/api/llm/seen         {"version"} その版にした変更を、ユーザーが見た（ユーザーの履歴へ移した）
//	DELETE /d/<id>/api/llm              全部を消す（ブックを閉じた）
//	POST   /d/<id>/api/llm/<n>/revert   n 番の変更を取り消す（CLI の matomezu revert。今の中身にその差分の逆を当てて書く）
//
// 画面の保存が、まだ見ていない LLM の変更の項目を上書きしたら（Undo など）、その変更に印を付ける（overwritten）

import (
	"encoding/json"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"time"
)

const llmMax = 200

// LLMEntry は LLM の履歴の 1 件
type LLMEntry struct {
	N           int           `json:"n"`       // 番号（ブックごとに 1 から）
	At          int64         `json:"at"`      // 変わった時刻（ミリ秒）
	Version     string        `json:"version"` // 変わった後のファイルの版
	Note        string        `json:"note,omitempty"`
	Changes     []Change      `json:"changes"`
	Seen        bool          `json:"seen,omitempty"`        // ユーザーが見た（画面のユーザーの履歴へ移した）
	Overwritten []Overwritten `json:"overwritten,omitempty"` // 見る前に、画面の保存が上書きした項目
}

// Overwritten は、まだ見ていない LLM の変更を画面の保存が上書きしたときの印
type Overwritten struct {
	At    int64    `json:"at"`
	Items []string `json:"items"` // "node:3:x" の形
}

func (h *Hub) llmPath(id string) string {
	if h.store == "" {
		return ""
	}
	return filepath.Join(filepath.Dir(h.store), "llm", id+".json")
}

// readLLM は h.llmMu を持って呼ぶ
func (h *Hub) readLLM(id string) []LLMEntry {
	var out []LLMEntry
	if p := h.llmPath(id); p != "" {
		if b, err := os.ReadFile(p); err == nil {
			json.Unmarshal(b, &out)
		}
	}
	if out == nil {
		out = []LLMEntry{}
	}
	return out
}

// writeLLM は h.llmMu を持って呼ぶ
func (h *Hub) writeLLM(id string, entries []LLMEntry) {
	p := h.llmPath(id)
	if p == "" {
		return
	}
	if len(entries) > llmMax {
		entries = entries[len(entries)-llmMax:]
	}
	if os.MkdirAll(filepath.Dir(p), 0o700) != nil {
		return
	}
	b, _ := json.MarshalIndent(entries, "", "  ")
	if writeAtomic(p, b) == nil {
		_ = os.Chmod(p, 0o600)
	}
}

// recordExternal は、画面からの保存ではないファイルの変化を LLM の履歴に足す（doc.go の sawFile が呼ぶ）
func (h *Hub) recordExternal(id string, before, after []byte, version, note string) {
	chs := diffDocs(before, after)
	if len(chs) == 0 || h.store == "" {
		return
	}
	h.llmMu.Lock()
	defer h.llmMu.Unlock()
	entries := h.readLLM(id)
	n := 1
	if len(entries) > 0 {
		n = entries[len(entries)-1].N + 1
	}
	entries = append(entries, LLMEntry{N: n, At: time.Now().UnixMilli(), Version: version, Note: note, Changes: chs})
	h.writeLLM(id, entries)
}

// recordUserSave は画面からの保存で、まだ見ていない LLM の変更の項目を上書きしたら印を付ける（doc.go の putData が呼ぶ）。
// 項目ごとに、最後にそれを変えた LLM の変更を新しい方から探し、見ていなければ印を付ける
func (h *Hub) recordUserSave(id string, before, after []byte) {
	if h.store == "" {
		return
	}
	saved := touched(diffDocs(before, after))
	if len(saved) == 0 {
		return
	}
	h.llmMu.Lock()
	defer h.llmMu.Unlock()
	entries := h.readLLM(id)
	claimed := map[string]bool{}
	changed := false
	now := time.Now().UnixMilli()
	for i := len(entries) - 1; i >= 0; i-- {
		var hit []string
		for k := range touched(entries[i].Changes) {
			if claimed[k] {
				continue
			}
			claimed[k] = true
			if !entries[i].Seen && saved[k] {
				hit = append(hit, k)
			}
		}
		if len(hit) > 0 {
			entries[i].Overwritten = append(entries[i].Overwritten, Overwritten{At: now, Items: hit})
			changed = true
		}
	}
	if changed {
		h.writeLLM(id, entries)
	}
}

func (h *Hub) withLLM(fn func(d *doc, w http.ResponseWriter, r *http.Request)) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		d := h.doc(r.PathValue("id"))
		if d == nil {
			http.Error(w, "unknown diagram", http.StatusNotFound)
			return
		}
		if h.store == "" {
			http.Error(w, "no state folder for the LLM history", http.StatusNotFound)
			return
		}
		fn(d, w, r)
	}
}

func (h *Hub) getLLM(d *doc, w http.ResponseWriter, _ *http.Request) {
	d.refresh()
	h.llmMu.Lock()
	entries := h.readLLM(d.id)
	h.llmMu.Unlock()
	w.Header().Set("Cache-Control", "no-store")
	writeJSON(w, map[string]any{"entries": entries})
}

func (h *Hub) seenLLM(d *doc, w http.ResponseWriter, r *http.Request) {
	var body struct {
		Version string `json:"version"`
	}
	if json.NewDecoder(http.MaxBytesReader(w, r.Body, 4096)).Decode(&body) != nil || body.Version == "" {
		http.Error(w, "version required", http.StatusBadRequest)
		return
	}
	h.llmMu.Lock()
	defer h.llmMu.Unlock()
	entries := h.readLLM(d.id)
	changed := false
	for i := range entries {
		if entries[i].Version == body.Version && !entries[i].Seen {
			entries[i].Seen, changed = true, true
		}
	}
	if changed {
		h.writeLLM(d.id, entries)
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *Hub) deleteLLM(d *doc, w http.ResponseWriter, _ *http.Request) {
	h.llmMu.Lock()
	defer h.llmMu.Unlock()
	if p := h.llmPath(d.id); p != "" {
		os.Remove(p)
	}
	w.WriteHeader(http.StatusNoContent)
}

// revertLLM は n 番の変更の逆を、今のファイルの中身に当てて書く。書いた変化も LLM の履歴に「n 番の取り消し」として残る
func (h *Hub) revertLLM(d *doc, w http.ResponseWriter, r *http.Request) {
	n, err := strconv.Atoi(r.PathValue("n"))
	if err != nil {
		http.Error(w, "bad number", http.StatusBadRequest)
		return
	}
	d.refresh()
	h.llmMu.Lock()
	entries := h.readLLM(d.id)
	h.llmMu.Unlock()
	var target *LLMEntry
	for i := range entries {
		if entries[i].N == n {
			target = &entries[i]
		}
	}
	if target == nil {
		http.Error(w, "no such entry in the LLM history: "+strconv.Itoa(n), http.StatusNotFound)
		return
	}
	if err := d.rewrite(func(cur []byte) ([]byte, error) { return revertChanges(cur, target.Changes) }, "revert "+strconv.Itoa(n)); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, map[string]any{"version": d.currentVersion()})
}
