package server

// 郵便箱（D26 の段階 3。docs/UI-plan.md）。ブックごとに、ほかのブックから送られた箱や、LLM が開くよう頼んだブックの知らせが届く。
// ブックのファイルには書かず、状態のフォルダの mail/<図の id>.json に置く（LLM の書き換えとぶつからず、LLM が自分の箱と勘違いしない）。
//
//	GET    /d/<id>/api/mail          {"items": [...]} 届いている物（古い順）
//	POST   /d/<id>/api/mail          届ける。本文は 1 件の中身（JSON のオブジェクト。kind などは画面が決める）。{"id"} を返す
//	POST   /d/<id>/api/mail/read     全部を読んだことにする
//	DELETE /d/<id>/api/mail/<item>   1 件を取り除く（置いた・開いた・消した）
//
// 変わったら SSE の mail イベント {"doc"} で画面に知らせる。書き込みは画面からだけ（fromPage）。状態のフォルダが無ければ使えない

import (
	"encoding/json"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"time"
)

// mailLimit は 1 件の中身の大きさの上限（箱の部分木を写すので、図より小さければ足りる）
const mailLimit = 1 << 20

// mailMax はブックごとに残す件数（古いものから捨てる）
const mailMax = 200

// MailItem は郵便箱の 1 件。Body は画面が決めた中身
type MailItem struct {
	ID   string          `json:"id"`
	At   int64           `json:"at"`   // 届いた時刻（ミリ秒）
	Read bool            `json:"read"` // 読んだか（郵便箱を開いたら読んだことにする）
	Body json.RawMessage `json:"body"`
}

func (h *Hub) mailPath(id string) string {
	if h.store == "" {
		return ""
	}
	return filepath.Join(filepath.Dir(h.store), "mail", id+".json")
}

// readMail は届いている物（無ければ空）。h.mailMu を持って呼ぶ
func (h *Hub) readMail(id string) []MailItem {
	var items []MailItem
	if b, err := os.ReadFile(h.mailPath(id)); err == nil {
		json.Unmarshal(b, &items)
	}
	if items == nil {
		items = []MailItem{}
	}
	return items
}

// writeMail は届いている物を書き、画面に知らせる。h.mailMu を持って呼ぶ
func (h *Hub) writeMail(id string, items []MailItem) error {
	p := h.mailPath(id)
	if err := os.MkdirAll(filepath.Dir(p), 0o700); err != nil {
		return err
	}
	b, _ := json.MarshalIndent(items, "", "  ")
	if err := writeAtomic(p, b); err != nil {
		return err
	}
	_ = os.Chmod(p, 0o600)
	h.broadcast(event{"mail", jsonString(map[string]string{"doc": id})})
	return nil
}

// withMail は、登録した図で、状態のフォルダがあるときだけ fn を呼ぶ
func (h *Hub) withMail(fn func(id string, w http.ResponseWriter, r *http.Request)) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id := r.PathValue("id")
		if h.doc(id) == nil {
			http.Error(w, "unknown diagram", http.StatusNotFound)
			return
		}
		if h.store == "" {
			http.Error(w, "no state folder for the mailbox", http.StatusNotFound)
			return
		}
		fn(id, w, r)
	}
}

func (h *Hub) getMail(id string, w http.ResponseWriter, _ *http.Request) {
	h.mailMu.Lock()
	items := h.readMail(id)
	h.mailMu.Unlock()
	writeJSON(w, map[string]any{"items": items})
}

func (h *Hub) postMail(id string, w http.ResponseWriter, r *http.Request) {
	body, err := io.ReadAll(http.MaxBytesReader(w, r.Body, mailLimit))
	var obj map[string]any
	if err != nil || json.Unmarshal(body, &obj) != nil || obj == nil {
		http.Error(w, "the body must be a JSON object", http.StatusBadRequest)
		return
	}
	h.mailMu.Lock()
	defer h.mailMu.Unlock()
	now := time.Now()
	item := MailItem{ID: strconv.FormatInt(now.UnixNano(), 36), At: now.UnixMilli(), Body: body}
	items := append(h.readMail(id), item)
	if len(items) > mailMax {
		items = items[len(items)-mailMax:]
	}
	if err := h.writeMail(id, items); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, map[string]string{"id": item.ID})
}

func (h *Hub) readAllMail(id string, w http.ResponseWriter, _ *http.Request) {
	h.mailMu.Lock()
	defer h.mailMu.Unlock()
	items := h.readMail(id)
	changed := false
	for i := range items {
		if !items[i].Read {
			items[i].Read, changed = true, true
		}
	}
	if changed {
		if err := h.writeMail(id, items); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *Hub) deleteMail(id string, w http.ResponseWriter, r *http.Request) {
	h.mailMu.Lock()
	defer h.mailMu.Unlock()
	items := h.readMail(id)
	out := items[:0]
	for _, it := range items {
		if it.ID != r.PathValue("item") {
			out = append(out, it)
		}
	}
	if len(out) != len(items) {
		if err := h.writeMail(id, out); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
	}
	w.WriteHeader(http.StatusNoContent)
}
