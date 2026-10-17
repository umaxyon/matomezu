package server

// AI だけが出せる応答の要求（D36。matomezu ask。docs/ASK-plan.md）。箱に結び付けた問い（項目）を 1 つの話題にまとめて画面に出し、答えを受け取る。
// ファイルには書かず、サーバーが持つ（画面の読み直しでは消えず、サーバーの入れ替えで消える）。同時に持てる話題は 1 つ。
//
//	POST /api/ask           {"path", "items"} 話題を出す。カレントの画面に頼み（イベント ask）、答え {"state", "items"} を返す … 要トークン
//	                        話題が残っている・フォーカスの反応待ち・ユーザーが操作中なら 409、項目の誤り・箱が無いなどは 400 / 422
//	GET  /api/ask           今の話題（無ければ {}）。画面がつないだとき・変わったと知らされたときに読む。?last=1 はユーザーが終えた話題も（ask -status）
//	GET  /api/ask?new=1     前に読んだあとにユーザーが答えた・終えたなどがあれば話題を、無ければ {}（ask -new。フックで会話のたびに見る）
//	GET  /api/ask/wait?sec= 話題が片付くまで待つ（ask -wait）: 全部の問いに答えた・ユーザーが終えた・終わらせた・移るのを断られた・ブックを閉じた・時間切れで
//	                        {"reason", "topic"} を返す。サーバーが止まる・コマンドが切れると待ちも消える（何も残らない）
//	POST /api/ask/control   {"end"} 話題を終わらせる・{"hide": id} / {"show": id} 吹き出しを閉じる・開く。今の話題を返す … 要トークン
//	POST /api/ask/screen    画面から: {"state": "open" | "declined" | "closed" | "ended"}（ほかのブックへ移る確かめの答え・ブックを閉じた・
//	                        ユーザーがパレットの「終える」で終えた）か
//	                        {"item", "state": "open" | "hidden" | "answered" | "seen" | "declined", "answer", "note"}（ユーザーの操作）
//
// 吹き出しかドロワーかは、文字の量でここが決める（AI は選ばない。2026-10-16 ユーザー）。
// 吹き出し: 本文は全角 20 文字まで（半角は 0.5）、ボタン 2 つまでで文言の合計 6 文字まで、複数選択・文字の入力なし。超えればドロワー（本文 150 文字まで）。
// 変わるたびに、つながっている画面へ askchanged を送る（画面は GET /api/ask で読み直す）。
// ユーザーが終えた話題は、その場で終わる（AI の -end を待たずに次を出せる）。答えは次の話題を出すまで ask -status と check で読める（lastTopic）。

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"
	"unicode"
	"unicode/utf8"
)

// 吹き出しとドロワーの上限（全角 1・半角 0.5 で数える。docs/ASK-plan.md）
const (
	bubbleText    = 20
	bubbleButtons = 2
	bubbleLabels  = 6
	drawerText    = 150
)

// AskItem は話題の中の 1 つの問い
type AskItem struct {
	ID      string   `json:"id"`
	Box     string   `json:"box"`
	Text    string   `json:"text,omitempty"`
	Choices []string `json:"choices,omitempty"` // ボタン（ドロワーで multi なら選択肢）
	Multi   bool     `json:"multi,omitempty"`   // 複数選んで答える（ドロワー）
	Input   bool     `json:"input,omitempty"`   // 文字でも答えられる（ドロワー。「答えない」がいつも付く）
	View    string   `json:"view"`              // bubble / drawer（ここが決める）
	Letter  string   `json:"letter,omitempty"`  // 2 つ以上のとき A, B, …
	State   string   `json:"state"`             // open / hidden / answered / seen / declined
	Answer  []string `json:"answer,omitempty"`  // 選んだ文言
	Note    string   `json:"note,omitempty"`    // 文字の答え
}

// Topic は今の話題
type Topic struct {
	Doc   string    `json:"doc"`
	Path  string    `json:"path"`
	State string    `json:"state"` // asking（ほかのブックへ移る確かめ中）/ open / declined（移るのを断られた）/ closed（ユーザーがブックを閉じた）/ ended（ユーザーが終えた）
	Items []AskItem `json:"items"`
	At    int64     `json:"at"`
	rev   int       // ユーザーの答え・話題の様子が変わった回数（hidden の開閉は数えない）
	told  int       // AI が読んだときの rev（ask -status・-new・-wait。-new はこれより新しいときだけ出す）
}

// width は文字の幅（全角 1・半角 0.5）
func width(s string) float64 {
	w := 0.0
	for _, r := range s {
		if r < 0x80 || (r >= 0xff61 && r <= 0xff9f) {
			w += 0.5
		} else {
			w++
		}
	}
	return w
}

// prepare は項目を確かめ、id・見せ方・文字を決める
func prepare(items []AskItem) ([]AskItem, error) {
	if len(items) == 0 {
		return nil, errors.New("no items: give at least one {\"box\", \"text\", \"choices\"}")
	}
	if len(items) > 26 {
		return nil, errors.New("too many items (26 at most); ask fewer at a time")
	}
	seen := map[string]bool{}
	out := make([]AskItem, len(items))
	for i, it := range items {
		if it.ID == "" {
			it.ID = fmt.Sprint(i + 1)
		}
		if seen[it.ID] {
			return nil, fmt.Errorf("item id %q is used twice", it.ID)
		}
		seen[it.ID] = true
		if it.Box == "" {
			return nil, fmt.Errorf("item %s: box required", it.ID)
		}
		it.Text = strings.TrimSpace(it.Text)
		if it.Text == "" && len(it.Choices) == 0 {
			return nil, fmt.Errorf("item %s: give text, choices or both", it.ID)
		}
		labels := 0.0
		for _, c := range it.Choices {
			if strings.TrimSpace(c) == "" {
				return nil, fmt.Errorf("item %s: an empty choice", it.ID)
			}
			labels += width(c)
		}
		if it.Multi && len(it.Choices) < 2 {
			return nil, fmt.Errorf("item %s: multi needs two or more choices", it.ID)
		}
		if width(it.Text) <= bubbleText && len(it.Choices) <= bubbleButtons && labels <= bubbleLabels && !it.Multi && !it.Input {
			it.View = "bubble"
		} else {
			it.View = "drawer"
			if width(it.Text) > drawerText {
				return nil, fmt.Errorf("item %s: the text is too long (%d characters at most); say the details in the chat", it.ID, drawerText)
			}
		}
		if len(items) > 1 {
			it.Letter = string(rune('A' + i))
		}
		it.State, it.Answer, it.Note = "open", nil, ""
		out[i] = it
	}
	return out, nil
}

var errTopicOpen = errors.New("a topic of questions is still open; end it first: matomezu ask -end")

// Ask は話題を出す。カレントの画面が出せたら（shown）か、ほかのブックへ移るのを確かめていれば（asked）話題を残す
func (h *Hub) Ask(path string, items []AskItem) (string, *Topic, error) {
	items, err := prepare(items)
	if err != nil {
		return "", nil, err
	}
	return h.ask(path, items, false)
}

// ask は確かめた項目で話題を出す。focus なら、画面は 1 つ目の箱にフォーカスの枠も出す（matomezu focus -button）
func (h *Hub) ask(path string, items []AskItem, focus bool) (string, *Topic, error) {
	res, err := h.existingDoc(path)
	if err != nil {
		return "", nil, err
	}
	h.mu.Lock()
	if h.topic != nil {
		h.mu.Unlock()
		return "", nil, errTopicOpen
	}
	if h.tour != nil && !h.tour.done() {
		h.mu.Unlock()
		return "", nil, errTourOpen
	}
	t := &Topic{Doc: res.ID, Path: path, State: "asking", Items: items, At: time.Now().UnixMilli()}
	h.topic = t
	h.lastTopic = nil
	h.mu.Unlock()
	msg := map[string]string{"doc": res.ID}
	if focus {
		msg["focus"] = "true"
	}
	a, err := h.askScreen("ask", msg)
	drop := func() {
		h.mu.Lock()
		if h.topic == t {
			h.topic = nil
		}
		h.mu.Unlock()
	}
	if err == nil {
		switch a.State {
		case "busy":
			err = errBusy
		case "pending":
			err = errPending
		case "error":
			err = errors.New(a.Error)
		case "shown":
			h.mu.Lock()
			if h.topic == t && t.State == "asking" {
				t.State = "open"
			}
			h.mu.Unlock()
		}
	}
	if err != nil {
		drop()
		return "", nil, err
	}
	h.askChanged()
	return a.State, h.Topic(), nil
}

// askChanged は話題が変わったことを、画面（askchanged）と待っている ask -wait に知らせる
func (h *Hub) askChanged() {
	h.mu.Lock()
	if h.askSig != nil {
		close(h.askSig)
		h.askSig = nil
	}
	h.mu.Unlock()
	h.broadcast(event{"askchanged", "{}"})
}

// Topic は今の話題の写し（無ければ nil）
func (h *Hub) Topic() *Topic {
	h.mu.Lock()
	defer h.mu.Unlock()
	if h.topic == nil {
		return nil
	}
	t := *h.topic
	t.Items = append([]AskItem(nil), h.topic.Items...)
	return &t
}

// askLine は matomezu check に添える 1 行（その図の話題があるとき）
func (h *Hub) askLine(doc string) string {
	t := h.Topic()
	if t == nil {
		if l := h.LastTopic(); l != nil && l.Doc == doc {
			return fmt.Sprintf("ask: the user ended the topic (%d of %d questions responded); matomezu ask -status shows the answers", responded(l), len(l.Items))
		}
		return ""
	}
	if t.Doc != doc {
		return ""
	}
	switch t.State {
	case "asking":
		return "ask: asked the user whether to move to this diagram to show the questions; no answer yet (matomezu ask -status)"
	case "declined":
		return "ask: the user declined to move to the questions; end the topic: matomezu ask -end"
	case "closed":
		return "ask: the user closed this diagram; end the topic: matomezu ask -end"
	}
	return fmt.Sprintf("ask: %d of %d questions responded (matomezu ask -status for the answers; matomezu ask -end when you have enough)", responded(t), len(t.Items))
}

// responded は答えた（見た・答えないも）問いの数
func responded(t *Topic) int {
	n := 0
	for _, it := range t.Items {
		if it.State == "answered" || it.State == "seen" || it.State == "declined" {
			n++
		}
	}
	return n
}

// LastTopic はユーザーが終えた話題の写し（次の話題を出すまで。無ければ nil）
func (h *Hub) LastTopic() *Topic {
	h.mu.Lock()
	defer h.mu.Unlock()
	if h.lastTopic == nil {
		return nil
	}
	t := *h.lastTopic
	t.Items = append([]AskItem(nil), h.lastTopic.Items...)
	return &t
}

// AskControl は話題を終わらせる・吹き出しを開閉する
type AskControl struct {
	End  bool   `json:"end"`
	Hide string `json:"hide"`
	Show string `json:"show"`
}

func (h *Hub) Control(c AskControl) (*Topic, error) {
	h.mu.Lock()
	t := h.topic
	if t == nil {
		h.mu.Unlock()
		return nil, errors.New("no topic of questions is open")
	}
	last := *t
	last.Items = append([]AskItem(nil), t.Items...)
	switch {
	case c.End:
		h.topic = nil
	case c.Hide != "" || c.Show != "":
		id, to, from := c.Hide, "hidden", "open"
		if c.Show != "" {
			id, to, from = c.Show, "open", "hidden"
		}
		i := itemIndex(t, id)
		if i < 0 {
			h.mu.Unlock()
			return nil, fmt.Errorf("no question %q in the topic", id)
		}
		if t.Items[i].State != from && t.Items[i].State != to {
			h.mu.Unlock()
			return nil, fmt.Errorf("question %q is already %s", id, t.Items[i].State)
		}
		t.Items[i].State = to
		last.Items[i].State = to
	}
	h.mu.Unlock()
	h.askChanged()
	return &last, nil
}

func itemIndex(t *Topic, id string) int {
	for i, it := range t.Items {
		if it.ID == id || (it.Letter != "" && strings.EqualFold(it.Letter, id)) {
			return i
		}
	}
	return -1
}

func (h *Hub) askHTTP(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Path  string    `json:"path"`
		Items []AskItem `json:"items"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 256<<10)).Decode(&req); err != nil || req.Path == "" {
		http.Error(w, "path required", http.StatusBadRequest)
		return
	}
	state, t, err := h.Ask(req.Path, req.Items)
	switch {
	case errors.Is(err, errNoScreen), errors.Is(err, errBusy), errors.Is(err, errPending), errors.Is(err, errTopicOpen), errors.Is(err, errTourOpen):
		http.Error(w, err.Error(), http.StatusConflict)
	case err != nil:
		http.Error(w, err.Error(), http.StatusUnprocessableEntity)
	default:
		writeJSON(w, map[string]any{"state": state, "topic": t})
	}
}

// getAsk は今の話題。?last=1 なら、話題が無いときユーザーが終えた話題を返す（ask -status。画面は今の話題だけを描く）。
// ?new=1 は、前に読んだあとにユーザーの側で変わったときだけ返す（ask -new）。AI が読んだ（last・new）なら、読んだ印を付ける
func (h *Hub) getAsk(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	news, last := q.Get("new") != "", q.Get("last") != ""
	h.mu.Lock()
	t := h.topic
	if t == nil && (last || news) {
		t = h.lastTopic
	}
	if t != nil && news && t.rev <= t.told {
		t = nil
	}
	var out any = map[string]any{}
	if t != nil {
		if last || news {
			t.told = t.rev
		}
		c := *t
		c.Items = append([]AskItem(nil), t.Items...)
		out = &c
	}
	h.mu.Unlock()
	writeJSON(w, out)
}

// AskWait は ask -wait の答え。reason は answered（全部の問いに答えた）/ ended（ユーザーが終えた）/ withdrawn（-end で終わった）/
// declined（移るのを断られた）/ closed（ブックを閉じた）/ timeout / none（話題が無い）
type AskWait struct {
	Reason string `json:"reason"`
	Topic  *Topic `json:"topic"`
}

// askWait は話題が片付くまで待つ。時間は ?sec=（既定 600 秒・上限 3600 秒）
func (h *Hub) askWait(w http.ResponseWriter, r *http.Request) {
	sec, _ := strconv.Atoi(r.URL.Query().Get("sec"))
	if sec <= 0 {
		sec = 600
	}
	sec = min(sec, 3600)
	timer := time.NewTimer(time.Duration(sec) * time.Second)
	defer timer.Stop()
	h.mu.Lock()
	start := h.topic
	h.mu.Unlock()
	for {
		h.mu.Lock()
		res, sig := h.waitState(start), (chan struct{})(nil)
		if res.Reason == "" {
			if h.askSig == nil {
				h.askSig = make(chan struct{})
			}
			sig = h.askSig
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
			res = AskWait{Reason: "timeout", Topic: h.copyTopic(h.topic)}
			h.mu.Unlock()
			writeJSON(w, res)
			return
		case <-r.Context().Done(): // コマンドが切れた・サーバーが止まる
			return
		}
	}
}

// waitState は待ち始めた話題 start が片付いたか（片付いていなければ Reason が空）。h.mu を持って呼ぶ。片付いたなら読んだ印を付ける
func (h *Hub) waitState(start *Topic) AskWait {
	t := h.topic
	reason := ""
	switch {
	case start == nil:
		reason = "none"
	case t != start:
		reason, t = "withdrawn", nil
		if h.lastTopic == start {
			reason, t = "ended", start
		}
	case t.State == "declined" || t.State == "closed":
		reason = t.State
	case responded(t) == len(t.Items):
		reason = "answered"
	}
	if reason == "" {
		return AskWait{}
	}
	if t != nil {
		t.told = t.rev
	}
	return AskWait{Reason: reason, Topic: h.copyTopic(t)}
}

// copyTopic は話題の写し（nil なら nil）。h.mu を持って呼ぶ
func (h *Hub) copyTopic(t *Topic) *Topic {
	if t == nil {
		return nil
	}
	c := *t
	c.Items = append([]AskItem(nil), t.Items...)
	return &c
}

func (h *Hub) askControl(w http.ResponseWriter, r *http.Request) {
	var c AskControl
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 64<<10)).Decode(&c); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if c.End {
		if t := h.Topic(); t == nil {
			// 終わらせる話題が無いのは誤りにしない（何度呼んでもよい）。ユーザーが終えた話題があれば、それを返す
			if l := h.LastTopic(); l != nil {
				writeJSON(w, l)
				return
			}
			writeJSON(w, map[string]any{})
			return
		}
	}
	t, err := h.Control(c)
	if err != nil {
		http.Error(w, err.Error(), http.StatusUnprocessableEntity)
		return
	}
	writeJSON(w, t)
}

// askScreenUpdate は画面からの知らせ（ユーザーの操作）
func (h *Hub) askScreenUpdate(w http.ResponseWriter, r *http.Request) {
	var u struct {
		State  string   `json:"state"`
		Item   string   `json:"item"`
		Answer []string `json:"answer"`
		Note   string   `json:"note"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 64<<10)).Decode(&u); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	h.mu.Lock()
	t := h.topic
	if t == nil {
		h.mu.Unlock()
		http.Error(w, "no topic", http.StatusNotFound)
		return
	}
	if u.Item == "" {
		switch u.State {
		case "open":
			t.State = u.State
		case "declined", "closed":
			t.State = u.State
			t.rev++
		case "ended":
			t.State = u.State
			t.rev++
			h.lastTopic, h.topic = t, nil
		default:
			h.mu.Unlock()
			http.Error(w, "unknown state", http.StatusBadRequest)
			return
		}
	} else {
		i := itemIndex(t, u.Item)
		ok := map[string]bool{"open": true, "hidden": true, "answered": true, "seen": true, "declined": true}[u.State]
		if i < 0 || !ok {
			h.mu.Unlock()
			http.Error(w, "unknown item or state", http.StatusBadRequest)
			return
		}
		it := &t.Items[i]
		if u.State != "open" && u.State != "hidden" && (u.State != it.State || u.State == "answered") {
			t.rev++
		}
		it.State = u.State
		if u.State == "answered" {
			it.Answer = u.Answer
			if utf8.RuneCountInString(u.Note) > 2000 {
				u.Note = string([]rune(u.Note)[:2000])
			}
			it.Note = strings.TrimFunc(u.Note, unicode.IsSpace)
		}
	}
	h.mu.Unlock()
	h.askChanged()
	w.WriteHeader(http.StatusNoContent)
}
