package server

// 紙に収まるかの問い合わせ（matomezu set の確かめと、matomezu open の判定。D33。docs/PAPER-plan.md の 4.6 の 7）。
//
//	POST /api/fit          {"path", "data"} 書き換えたあとの中身（data）が紙に収まるかを、カレントの画面に頼んで返す（{"over": [...]}） … 要トークン
//	                       画面が無ければ 409（確かめられないので set は断る）、ユーザーが操作中なら 409（busy）、画面が読めなければ 422
//	GET  /api/fit/{req}    画面が、預けた中身を取りに来る（イベントに載せずに渡す。大きな図でも SSE を詰まらせない）
//	POST /api/fit/{req}    画面からの答え {"over": [...]} か {"busy": true} か {"error"}
//
// 画面は、預けた中身を開いたときと同じに見えない所で並べ、紙の外の箱を形を変えずに押し込んでも収まらないページを返す
// （web/src/app-answers.ts の answerFit）。open の判定なら、収まらないとき画面はマスターを出して知らせる（そのブックは届けない）

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"path/filepath"
	"time"
)

// FitBox は、紙に収まらなかった並びの最上位の箱
type FitBox struct {
	ID      string `json:"id"`
	Caption string `json:"caption"`
}

// FitOver は、あるページ（"" は最初のページ）が紙に収まらなかったこと。Axis の向き（"x" は横の並び、"y" は縦の並び）に、
// 端から端へつながった箱の並び（Boxes）が、紙より Short px 長い（押し込みは並びの向きだけで、折り返さないので入らない）
type FitOver struct {
	Page  string   `json:"page"`
	Name  string   `json:"name"`  // ページの名前（最初のページは画面の言葉で「最初のページ」）
	Paper string   `json:"paper"` // 紙の型と大きさ（例 "a4-landscape 1123x794"）
	Axis  string   `json:"axis"`
	Short int      `json:"short"`
	Boxes []FitBox `json:"boxes"`
}

type fitAnswer struct {
	Over  []FitOver `json:"over"`
	Busy  bool      `json:"busy"`
	Error string    `json:"error"`
}

type fitRequest struct {
	data []byte
	ans  chan fitAnswer
}

// Fit は path の図を data にしたら紙に収まるかを、カレントの画面に頼んで返す（収まらないページ。収まれば空）。
// open なら matomezu open の判定で、収まらなければ画面はマスターを出して知らせる
func (h *Hub) Fit(path string, data []byte, open bool) ([]FitOver, error) {
	// open の判定では登録しない（開けなかったブックをマスターの一覧に載せない。名前は画面に渡す）
	var res OpenResult
	if open {
		abs, err := filepath.Abs(path)
		if err != nil {
			return nil, err
		}
		res = OpenResult{ID: docID(abs), Path: abs}
	} else {
		var err error
		if res, err = h.openDoc(path, "", false); err != nil {
			return nil, err
		}
	}
	req := newClientID()
	fr := &fitRequest{data: data, ans: make(chan fitAnswer, 1)}
	h.mu.Lock()
	if h.fits == nil {
		h.fits = map[string]*fitRequest{}
	}
	h.fits[req] = fr
	h.mu.Unlock()
	defer func() {
		h.mu.Lock()
		delete(h.fits, req)
		h.mu.Unlock()
	}()
	q := map[string]string{"req": req, "doc": res.ID}
	if open {
		q["open"] = "true"
		q["name"] = filepath.Base(res.Path)
	}
	if !h.sendCurrent(event{"fit", jsonString(q)}) {
		return nil, errNoScreen
	}
	select {
	case a := <-fr.ans:
		switch {
		case a.Busy:
			return nil, errBusy
		case a.Error != "":
			return nil, errors.New("the screen could not lay out the change: " + a.Error)
		}
		return a.Over, nil
	case <-time.After(summaryWait):
		return nil, errors.New("the screen did not answer; ask the user to reload the page")
	case <-h.ctx.Done():
		return nil, h.ctx.Err()
	}
}

func (h *Hub) fitRequest(r *http.Request) *fitRequest {
	h.mu.Lock()
	defer h.mu.Unlock()
	return h.fits[r.PathValue("req")]
}

func (h *Hub) fit(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Path string          `json:"path"`
		Data json.RawMessage `json:"data"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, maxBody)).Decode(&req); err != nil || req.Path == "" || len(req.Data) == 0 {
		http.Error(w, "path and data required", http.StatusBadRequest)
		return
	}
	over, err := h.Fit(req.Path, req.Data, false)
	switch {
	case errors.Is(err, errNoScreen), errors.Is(err, errBusy):
		http.Error(w, err.Error(), http.StatusConflict)
	case err != nil:
		http.Error(w, err.Error(), http.StatusUnprocessableEntity)
	default:
		writeJSON(w, map[string]any{"over": over})
	}
}

func (h *Hub) fitData(w http.ResponseWriter, r *http.Request) {
	fr := h.fitRequest(r)
	if fr == nil {
		http.Error(w, "unknown request", http.StatusNotFound)
		return
	}
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	w.Write(fr.data)
}

func (h *Hub) fitAnswer(w http.ResponseWriter, r *http.Request) {
	fr := h.fitRequest(r)
	if fr == nil {
		http.Error(w, "unknown request", http.StatusNotFound)
		return
	}
	b, err := io.ReadAll(http.MaxBytesReader(w, r.Body, maxBody))
	var a fitAnswer
	if err != nil || json.Unmarshal(b, &a) != nil {
		http.Error(w, "bad answer", http.StatusBadRequest)
		return
	}
	select {
	case fr.ans <- a:
	default:
	}
	w.WriteHeader(http.StatusNoContent)
}
