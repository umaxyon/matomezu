package server

// 通知（D30。docs/NOTIFY-plan.md）。LLM がユーザーに知らせる道具は、この 1 つにまとめ、新しい場面が出たら項目や動きを足して育てる。
//
//	POST /api/notify  {"title", "body", "path", "page", "box", "mail"} カレントの画面に通知を送る … 要トークン
//	                  path があれば「そのブック（page があればそのページ）を開く」動きを持つ（登録もする）。無ければ説明だけ。
//	                  box があれば、開いたらその箱（のページ）へ移ってフォーカス枠で示す（matomezu focus -mail。D37。題名が無ければ画面が付ける）。
//	                  mail なら郵便箱に入れるだけ。無ければダイアログも出す。画面が無ければ 409
//
// 画面（web/src/app.ts の deliver）は、今見ているブックの郵便箱に入れる。郵便箱の行を押すとダイアログ（題名・本文・開く / キャンセル）を挟む。
// matomezu open の「届いています」も、この通知の 1 つの使い方（hub.go の openDoc。arrive）。

import (
	"encoding/json"
	"errors"
	"net/http"
)

// NotifyRequest は通知の中身
type NotifyRequest struct {
	Title string `json:"title"`
	Body  string `json:"body"`
	Path  string `json:"path"`
	Page  string `json:"page"`
	Box   string `json:"box"`
	Mail  bool   `json:"mail"`
}

// Notify はカレントの画面に通知を送る
func (h *Hub) Notify(n NotifyRequest) error {
	if n.Title == "" && n.Box == "" {
		return errors.New("title required")
	}
	if n.Box != "" && n.Path == "" {
		return errors.New("a file is required with box")
	}
	msg := map[string]string{"title": n.Title, "body": n.Body}
	if n.Box != "" {
		msg["box"] = n.Box
	}
	if n.Path != "" {
		res, err := h.openDoc(n.Path, false, "", false)
		if err != nil {
			return err
		}
		msg["book"], msg["page"] = res.ID, n.Page
	}
	if !n.Mail {
		msg["dialog"] = "true"
	}
	if !h.sendCurrent(event{"notify", jsonString(msg)}) {
		return errNoScreen
	}
	return nil
}

func (h *Hub) notify(w http.ResponseWriter, r *http.Request) {
	var n NotifyRequest
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 64<<10)).Decode(&n); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	switch err := h.Notify(n); {
	case errors.Is(err, errNoScreen):
		http.Error(w, err.Error(), http.StatusConflict)
	case err != nil:
		http.Error(w, err.Error(), http.StatusBadRequest)
	default:
		w.WriteHeader(http.StatusNoContent)
	}
}
