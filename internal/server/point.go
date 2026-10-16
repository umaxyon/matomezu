package server

// AI が一時的に箱を示すフォーカス枠（D37。matomezu focus）。データには書かず、カレントの画面に頼んで枠を出すだけ。
//
//	POST /api/point        {"path", "box", "clear"} カレントの画面に、その図の箱を示すよう頼み、答え {"state"} を返す … 要トークン
//	                       画面が無ければ 409、ユーザーが操作中（busy）・前の枠にまだ反応が無い（pending）なら 409、箱が無いなどは 422
//	POST /api/point/{req}  画面からの答え {"state": "shown" | "asked" | "cleared" | "busy" | "pending" | "error", "error"}
//
// 判断は全部画面がする（web/src/app-point.ts）。待たずにすぐ答える（LLM の呼び出しを止めない。2026-10-16 ユーザー）:
// 今のブックならそのページへ移って枠を出し（shown）、ほかのブックなら移るかを確かめるダイアログを出して答える（asked）。
// 郵便箱に入れるフォーカス（matomezu focus -mail）は通知（notify.go）の box で送る。

import (
	"encoding/json"
	"errors"
	"net/http"
	"time"
)

// pointWait は画面の答えを待つ長さ（画面は待たずに答える）
const pointWait = 5 * time.Second

// PointRequest はフォーカスの頼み
type PointRequest struct {
	Path  string `json:"path"`
	Box   string `json:"box"`
	Clear bool   `json:"clear"` // 出している枠を消す（box は要らない）
}

// PointAnswer は画面の答え
type PointAnswer struct {
	State string `json:"state"`
	Error string `json:"error,omitempty"`
}

var errPending = errors.New("the user has not responded to the previous focus yet (they close it by clicking the diagram or pressing Esc); ask them in the chat, or run: matomezu focus -clear")

// Point はカレントの画面に箱を示すよう頼み、答えを返す
func (h *Hub) Point(p PointRequest) (PointAnswer, error) {
	msg := map[string]string{}
	if p.Clear {
		msg["clear"] = "true"
	} else {
		if p.Box == "" {
			return PointAnswer{}, errors.New("box required")
		}
		res, err := h.openDoc(p.Path, false, "", false)
		if err != nil {
			return PointAnswer{}, err
		}
		msg["doc"], msg["box"] = res.ID, p.Box
	}
	req := newClientID()
	ans := make(chan PointAnswer, 1)
	h.mu.Lock()
	var ch chan event
	if c := h.current(); c != nil {
		for k, v := range h.clients {
			if v == c {
				ch = k
			}
		}
	}
	if ch == nil {
		h.mu.Unlock()
		return PointAnswer{}, errNoScreen
	}
	if h.points == nil {
		h.points = map[string]chan PointAnswer{}
	}
	h.points[req] = ans
	h.mu.Unlock()
	defer func() {
		h.mu.Lock()
		delete(h.points, req)
		h.mu.Unlock()
	}()
	msg["req"] = req
	select {
	case ch <- event{"point", jsonString(msg)}:
	default:
		return PointAnswer{}, errors.New("the screen is not responding; ask the user to reload the page")
	}
	var a PointAnswer
	select {
	case a = <-ans:
	case <-time.After(pointWait):
		return PointAnswer{}, errors.New("the screen did not answer; ask the user to reload the page")
	case <-h.ctx.Done():
		return PointAnswer{}, h.ctx.Err()
	}
	switch a.State {
	case "busy":
		return a, errBusy
	case "pending":
		return a, errPending
	case "error":
		return a, errors.New(a.Error)
	}
	return a, nil
}

func (h *Hub) point(w http.ResponseWriter, r *http.Request) {
	var p PointRequest
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 64<<10)).Decode(&p); err != nil || (!p.Clear && p.Path == "") {
		http.Error(w, "path required", http.StatusBadRequest)
		return
	}
	a, err := h.Point(p)
	switch {
	case errors.Is(err, errNoScreen), errors.Is(err, errBusy), errors.Is(err, errPending):
		http.Error(w, err.Error(), http.StatusConflict)
	case err != nil:
		http.Error(w, err.Error(), http.StatusUnprocessableEntity)
	default:
		writeJSON(w, a)
	}
}

func (h *Hub) pointAnswer(w http.ResponseWriter, r *http.Request) {
	var a PointAnswer
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 64<<10)).Decode(&a); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	h.mu.Lock()
	ans := h.points[r.PathValue("req")]
	h.mu.Unlock()
	if ans == nil {
		http.Error(w, "unknown request", http.StatusNotFound)
		return
	}
	select {
	case ans <- a:
	default:
	}
	w.WriteHeader(http.StatusNoContent)
}
