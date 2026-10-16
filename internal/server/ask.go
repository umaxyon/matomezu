package server

// AI だけが出せる応答の要求（D36。matomezu ask。docs/ASK-plan.md）。箱に結び付けた問い（項目）を 1 つの話題にまとめて画面に出し、答えを受け取る。
// ファイルには書かず、サーバーが持つ（画面の読み直しでは消えず、サーバーの入れ替えで消える）。同時に持てる話題は 1 つ。
//
//	POST /api/ask           {"path", "items"} 話題を出す。カレントの画面に頼み（イベント ask）、答え {"state", "items"} を返す … 要トークン
//	                        話題が残っている・フォーカスの反応待ち・ユーザーが操作中なら 409、項目の誤り・箱が無いなどは 400 / 422
//	GET  /api/ask           今の話題（無ければ {}）。画面がつないだとき・変わったと知らされたときに読む
//	POST /api/ask/control   {"end"} 話題を終わらせる・{"hide": id} / {"show": id} 吹き出しを閉じる・開く。今の話題を返す … 要トークン
//	POST /api/ask/screen    画面から: {"state": "open" | "declined" | "closed"}（ほかのブックへ移る確かめの答え・ブックを閉じた）か
//	                        {"item", "state": "open" | "hidden" | "answered" | "seen" | "declined", "answer", "note"}（ユーザーの操作）
//
// 吹き出しかドロワーかは、文字の量でここが決める（AI は選ばない。2026-10-16 ユーザー）。
// 吹き出し: 本文は全角 20 文字まで（半角は 0.5）、ボタン 2 つまでで文言の合計 6 文字まで、複数選択・文字の入力なし。超えればドロワー（本文 150 文字まで）。
// 変わるたびに、つながっている画面へ askchanged を送る（画面は GET /api/ask で読み直す）。

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
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
	State string    `json:"state"` // asking（ほかのブックへ移る確かめ中）/ open / declined（移るのを断られた）/ closed（ユーザーがブックを閉じた）
	Items []AskItem `json:"items"`
	At    int64     `json:"at"`
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
	res, err := h.openDoc(path, false, "", false)
	if err != nil {
		return "", nil, err
	}
	h.mu.Lock()
	if h.topic != nil {
		h.mu.Unlock()
		return "", nil, errTopicOpen
	}
	t := &Topic{Doc: res.ID, Path: path, State: "asking", Items: items, At: time.Now().UnixMilli()}
	h.topic = t
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
	h.broadcast(event{"askchanged", "{}"})
	return a.State, h.Topic(), nil
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
	if t == nil || t.Doc != doc {
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
	done := 0
	for _, it := range t.Items {
		if it.State == "answered" || it.State == "seen" || it.State == "declined" {
			done++
		}
	}
	return fmt.Sprintf("ask: %d of %d questions responded (matomezu ask -status for the answers; matomezu ask -end when you have enough)", done, len(t.Items))
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
	h.broadcast(event{"askchanged", "{}"})
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
	case errors.Is(err, errNoScreen), errors.Is(err, errBusy), errors.Is(err, errPending), errors.Is(err, errTopicOpen):
		http.Error(w, err.Error(), http.StatusConflict)
	case err != nil:
		http.Error(w, err.Error(), http.StatusUnprocessableEntity)
	default:
		writeJSON(w, map[string]any{"state": state, "topic": t})
	}
}

func (h *Hub) getAsk(w http.ResponseWriter, _ *http.Request) {
	if t := h.Topic(); t != nil {
		writeJSON(w, t)
		return
	}
	writeJSON(w, map[string]any{})
}

func (h *Hub) askControl(w http.ResponseWriter, r *http.Request) {
	var c AskControl
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 64<<10)).Decode(&c); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if c.End {
		if t := h.Topic(); t == nil {
			writeJSON(w, map[string]any{}) // 終わらせる話題が無いのは誤りにしない（何度呼んでもよい）
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
		case "open", "declined", "closed":
			t.State = u.State
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
	h.broadcast(event{"askchanged", "{}"})
	w.WriteHeader(http.StatusNoContent)
}
