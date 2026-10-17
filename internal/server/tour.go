package server

// 説明ツアー（D38。matomezu tour。docs/TOUR-plan.md）。AI が箱を 1 つずつ順にたどって説明する。ファイルには書かず、サーバーが 1 つだけ持つ。
//
//	POST /api/tour          {"path", "title", "steps": [{"box", "say", "path"}], "mail"} 開始の案内をカレントの画面に頼み（イベント tour）、
//	                        画面の答え {"state": "offered"} を返す … 要トークン。ツアー・話題が残っている・ユーザーが操作中なら 409、誤りは 422
//	GET  /api/tour          今のツアー（無ければ {}）。画面がつないだとき・tourchanged で読む。?new=1 は終わった（complete / interrupt）のを AI がまだ読んでいなければ
//	POST /api/tour/control  {"end"} 取り下げる（画面はツアーを止める）… 要トークン
//	POST /api/tour/screen   画面から {"id", "state": "running" | "complete" | "interrupt"}（開始した・最後まで見た・途中で終えた / 拒否した）
//	GET  /api/tour/wait?sec= 終わる（complete / interrupt / 取り下げ）か時間切れまで待つ（tour -wait）
//
// AI に返すのは waiting（開始待ち）/ running / complete / interrupt だけ。どの段まで見たかは返さない（2026-10-16 ユーザー: 全部見ていなければ、
// ユーザーはこの件を理解していないものとして続きを考える）。終わったツアーは次のツアーを出すまで残る（-status と check で読める）。
// 同時に出せるのは、フォーカス・問い・ツアーのどれか 1 つ（フォーカスの反応待ちは画面が断る）。

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"
)

// tourSay は 1 段の説明の上限（全角 1・半角 0.5）、tourSteps は段の数の上限
const (
	tourSay   = 40
	tourSteps = 20
)

// TourStep はツアーの 1 段（箱 1 つ）
type TourStep struct {
	Doc  string `json:"doc"`
	Path string `json:"path,omitempty"`
	Box  string `json:"box"`
	Say  string `json:"say"`
}

// Tour は今のツアー
type Tour struct {
	ID    string     `json:"id"`
	Title string     `json:"title"`
	Doc   string     `json:"doc"` // 案内を出したブック（check の行を出す。ほかの段のブックにも出す）
	Path  string     `json:"path"`
	Steps []TourStep `json:"steps"`
	State string     `json:"state"` // waiting / running / complete / interrupt
	At    int64      `json:"at"`
	told  bool       // 終わったのを AI が読んだ（tour -new）
	sig   chan struct{}
}

// TourRequest は matomezu tour の頼み
type TourRequest struct {
	Path  string     `json:"path"`
	Title string     `json:"title"`
	Steps []TourStep `json:"steps"`
	Mail  bool       `json:"mail"`
}

var errTourOpen = errors.New("a tour is still waiting or running; wait for it (matomezu tour -wait) or withdraw it: matomezu tour -end")

func (t *Tour) done() bool { return t.State == "complete" || t.State == "interrupt" }

// StartTour は段を確かめ、開始の案内をカレントの画面に頼む
func (h *Hub) StartTour(r TourRequest) (*Tour, error) {
	r.Title = strings.TrimSpace(r.Title)
	if r.Title == "" {
		return nil, errors.New("a title is required (-title): what the tour explains")
	}
	if len(r.Steps) == 0 {
		return nil, errors.New(`no steps: give at least one {"box", "say"}`)
	}
	if len(r.Steps) > tourSteps {
		return nil, fmt.Errorf("too many steps (%d at most); explain fewer boxes, or in the chat", tourSteps)
	}
	steps := make([]TourStep, len(r.Steps))
	for i, s := range r.Steps {
		s.Say = strings.TrimSpace(s.Say)
		if s.Box == "" {
			return nil, fmt.Errorf("step %d: box required (one box per step)", i+1)
		}
		if s.Say == "" {
			return nil, fmt.Errorf("step %d: say required", i+1)
		}
		if width(s.Say) > tourSay {
			return nil, fmt.Errorf("step %d: say is too long (%d full-width characters at most); split it into steps or say the details in the chat", i+1, tourSay)
		}
		if s.Path == "" {
			s.Path = r.Path
		}
		res, err := h.existingDoc(s.Path)
		if err != nil {
			return nil, fmt.Errorf("step %d: %v", i+1, err)
		}
		s.Doc = res.ID
		steps[i] = s
	}
	h.mu.Lock()
	if h.tour != nil && !h.tour.done() {
		h.mu.Unlock()
		return nil, errTourOpen
	}
	if h.topic != nil {
		h.mu.Unlock()
		return nil, errTopicOpen
	}
	t := &Tour{ID: newClientID(), Title: r.Title, Doc: steps[0].Doc, Path: r.Path, Steps: steps, State: "waiting", At: time.Now().UnixMilli()}
	prev := h.tour
	h.tour = t
	h.mu.Unlock()
	msg := map[string]string{"id": t.ID}
	if r.Mail {
		msg["mail"] = "true"
	}
	a, err := h.askScreen("tour", msg)
	if err == nil {
		switch a.State {
		case "busy":
			err = errBusy
		case "pending":
			err = errPending
		case "error":
			err = errors.New(a.Error)
		}
	}
	if err != nil {
		h.mu.Lock()
		if h.tour == t {
			h.tour = prev
		}
		h.mu.Unlock()
		return nil, err
	}
	return h.copyTour(), nil
}

// copyTour は今のツアーの写し（無ければ nil）
func (h *Hub) copyTour() *Tour {
	h.mu.Lock()
	defer h.mu.Unlock()
	if h.tour == nil {
		return nil
	}
	c := *h.tour
	c.Steps = append([]TourStep(nil), h.tour.Steps...)
	return &c
}

// tourChanged はツアーが変わったことを、画面（tourchanged）と待っている tour -wait に知らせる
func (h *Hub) tourChanged(t *Tour) {
	h.mu.Lock()
	if t.sig != nil {
		close(t.sig)
		t.sig = nil
	}
	h.mu.Unlock()
	h.broadcast(event{"tourchanged", "{}"})
}

// tourLine は matomezu check に添える 1 行（その図がツアーの段にあるとき）
func (h *Hub) tourLine(doc string) string {
	t := h.copyTour()
	if t == nil {
		return ""
	}
	in := false
	for _, s := range t.Steps {
		in = in || s.Doc == doc
	}
	if !in {
		return ""
	}
	return "tour: " + tourWords(t)
}

func tourWords(t *Tour) string {
	switch t.State {
	case "waiting":
		return fmt.Sprintf("%q (%d steps) waits for the user to start it", t.Title, len(t.Steps))
	case "running":
		return fmt.Sprintf("the user is taking %q now", t.Title)
	case "complete":
		return fmt.Sprintf("complete: the user saw all of %q", t.Title)
	}
	return fmt.Sprintf("interrupt: the user did not finish %q; treat it as not understood", t.Title)
}

func (h *Hub) tourHTTP(w http.ResponseWriter, r *http.Request) {
	var req TourRequest
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 256<<10)).Decode(&req); err != nil || req.Path == "" {
		http.Error(w, "path required", http.StatusBadRequest)
		return
	}
	t, err := h.StartTour(req)
	switch {
	case errors.Is(err, errNoScreen), errors.Is(err, errBusy), errors.Is(err, errPending), errors.Is(err, errTopicOpen), errors.Is(err, errTourOpen):
		http.Error(w, err.Error(), http.StatusConflict)
	case err != nil:
		http.Error(w, err.Error(), http.StatusUnprocessableEntity)
	default:
		writeJSON(w, t)
	}
}

// getTour は今のツアー。?new=1 は、終わったのを AI がまだ読んでいなければ返し、読んだ印を付ける（tour -new）。
// ?status=1（tour -status）も、終わっていれば読んだ印を付ける
func (h *Hub) getTour(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	h.mu.Lock()
	t := h.tour
	if t != nil && q.Get("new") != "" && (!t.done() || t.told) {
		t = nil
	}
	var out any = map[string]any{}
	if t != nil {
		if (q.Get("new") != "" || q.Get("status") != "") && t.done() {
			t.told = true
		}
		c := *t
		c.Steps = append([]TourStep(nil), t.Steps...)
		out = &c
	}
	h.mu.Unlock()
	writeJSON(w, out)
}

func (h *Hub) tourControl(w http.ResponseWriter, r *http.Request) {
	var c struct {
		End bool `json:"end"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 64<<10)).Decode(&c); err != nil || !c.End {
		http.Error(w, `give {"end": true}`, http.StatusBadRequest)
		return
	}
	h.mu.Lock()
	t := h.tour
	if t == nil || t.done() {
		h.mu.Unlock()
		writeJSON(w, map[string]any{}) // 取り下げるツアーが無いのは誤りにしない
		return
	}
	h.tour = nil
	h.mu.Unlock()
	h.tourChanged(t)
	writeJSON(w, map[string]any{"ended": true})
}

// tourScreen は画面からの知らせ（開始した・最後まで見た・途中で終えた / 拒否した）
func (h *Hub) tourScreen(w http.ResponseWriter, r *http.Request) {
	var u struct {
		ID    string `json:"id"`
		State string `json:"state"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 64<<10)).Decode(&u); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	h.mu.Lock()
	t := h.tour
	if t == nil || t.ID != u.ID || t.done() {
		h.mu.Unlock()
		http.Error(w, "no such tour", http.StatusNotFound)
		return
	}
	switch u.State {
	case "running", "complete", "interrupt":
		t.State = u.State
	default:
		h.mu.Unlock()
		http.Error(w, "unknown state", http.StatusBadRequest)
		return
	}
	h.mu.Unlock()
	h.tourChanged(t)
	w.WriteHeader(http.StatusNoContent)
}

// TourWait は tour -wait の答え。reason は complete / interrupt / withdrawn（-end）/ timeout / none（ツアーが無い）
type TourWait struct {
	Reason string `json:"reason"`
	Tour   *Tour  `json:"tour"`
}

func (h *Hub) tourWait(w http.ResponseWriter, r *http.Request) {
	sec, _ := strconv.Atoi(r.URL.Query().Get("sec"))
	if sec <= 0 {
		sec = 600
	}
	timer := time.NewTimer(time.Duration(min(sec, 3600)) * time.Second)
	defer timer.Stop()
	h.mu.Lock()
	start := h.tour
	if start != nil && start.done() && start.told {
		start = nil // 終わったのを AI がもう読んだツアーは、待つ相手ではない（前のツアーの結果を新しい結果として返さない。2026-10-17 X10）
	}
	h.mu.Unlock()
	for {
		h.mu.Lock()
		res, sig := TourWait{}, (chan struct{})(nil)
		switch {
		case start == nil:
			res.Reason = "none"
		case h.tour != start:
			res.Reason = "withdrawn"
		case start.done():
			res.Reason, start.told = start.State, true
		default:
			if start.sig == nil {
				start.sig = make(chan struct{})
			}
			sig = start.sig
		}
		if res.Reason != "" && start != nil {
			c := *start
			res.Tour = &c
		}
		h.mu.Unlock()
		if sig == nil {
			writeJSON(w, res)
			return
		}
		select {
		case <-sig:
		case <-timer.C:
			h.mu.Lock()
			c := *start
			h.mu.Unlock()
			writeJSON(w, TourWait{Reason: "timeout", Tour: &c})
			return
		case <-r.Context().Done():
			return
		}
	}
}
