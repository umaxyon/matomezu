package server

// 配置の要約の問い合わせ（matomezu check。D30。docs/NOTIFY-plan.md）。
//
//	POST /api/summary        {"path", "page"} その図のページの要約を、カレントの画面に頼んで返す（Layout） … 要トークン
//	                         画面が無ければ 409、ユーザーが操作中で並べられなければ 409（busy）、画面が読めなければ 422
//	POST /api/summary/{req}  画面からの答え {"version", "page", "summary", "details"} か {"busy": true} か {"error"}
//
// 頼むのはカレントの画面（hub.go の current）だけで、画面は前に出さない（見ていないページは見えない所で並べる。web/src/app-answers.ts の answerSummary）。
// 要約はファイルの今の版のものに限る。頼むときにファイルを読み直して版を決め（set の直後でも古い版を返さない）、
// 答えの版が違えば（その間にファイルが変わった、画面がまだ読み直していない）頼み直す。

import (
	"encoding/json"
	"errors"
	"net/http"
	"os"
	"time"
)

// Layout はカレントの画面が配置した結果の要約。Version はそのとき画面が並べたファイルの版、Page は並べたページ。
// Details は子のある箱ごとの、子の位置と大きさ（箱の id ごとに 1 行。matomezu check の -in で出す）
type Layout struct {
	Version string            `json:"version"`
	Page    string            `json:"page"`
	Summary string            `json:"summary"`
	Details map[string]string `json:"details,omitempty"`
	Outside []string          `json:"outside,omitempty"` // 紙からはみ出している最上位の箱の id（D33。あれば check はエラーで終わる）
	Focus   string            `json:"focus,omitempty"`   // この図の箱を示したフォーカス枠の様子（D37。反応待ち・断られたなど。無ければ ""）
}

// summaryWait は要約を待つ長さ。画面がボタンを離すのを待つ長さ（web/src/app-answers.ts の SUMMARY_BUSY）より長く
const summaryWait = 15 * time.Second

// summaryAnswer は画面からの答え
type summaryAnswer struct {
	Layout
	Busy  bool   `json:"busy"`
	Error string `json:"error"`
}

var (
	errNoScreen = errors.New("not open in a browser; run: matomezu open <file>")
	errBusy     = errors.New("the user is operating the screen; try again shortly")
)

// freshVersion はファイルを読み直して、今の版を返す（外部の変化なら LLM の履歴にも残る。getData と同じ）
func (d *doc) freshVersion() (string, error) {
	d.mu.Lock()
	defer d.mu.Unlock()
	b, err := os.ReadFile(d.path)
	if err != nil {
		return "", err
	}
	d.sawFile(b, "")
	return d.version, nil
}

// Summary は path の図の page（"" は最初のページ）の要約を、カレントの画面に頼んで返す
func (h *Hub) Summary(path, page string) (Layout, error) {
	res, err := h.openDoc(path, false, "", false)
	if err != nil {
		return Layout{}, err
	}
	d := h.doc(res.ID)
	deadline := time.Now().Add(summaryWait)
	for {
		version, err := d.freshVersion()
		if err != nil {
			return Layout{}, err
		}
		a, err := h.askSummary(d.id, page, version, time.Until(deadline))
		if err != nil {
			return Layout{}, err
		}
		switch {
		case a.Busy:
			return Layout{}, errBusy
		case a.Error != "":
			return Layout{}, errors.New("the screen could not lay out the file: " + a.Error)
		}
		if now, err := d.freshVersion(); err == nil && a.Version == now {
			return a.Layout, nil
		}
		if time.Now().After(deadline) {
			return Layout{}, errors.New("the file kept changing while the screen laid it out; try again")
		}
		time.Sleep(100 * time.Millisecond)
	}
}

// askSummary はカレントの画面に 1 回頼み、答えを待つ
func (h *Hub) askSummary(doc, page, version string, wait time.Duration) (summaryAnswer, error) {
	req := newClientID()
	ans := make(chan summaryAnswer, 1)
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
		return summaryAnswer{}, errNoScreen
	}
	if h.summaries == nil {
		h.summaries = map[string]chan summaryAnswer{}
	}
	h.summaries[req] = ans
	h.mu.Unlock()
	defer func() {
		h.mu.Lock()
		delete(h.summaries, req)
		h.mu.Unlock()
	}()
	msg := event{"summary", jsonString(map[string]string{"req": req, "doc": doc, "page": page, "version": version})}
	select {
	case ch <- msg:
	default:
		return summaryAnswer{}, errors.New("the screen is not responding; ask the user to reload the page")
	}
	select {
	case a := <-ans:
		return a, nil
	case <-time.After(wait):
		return summaryAnswer{}, errors.New("the screen did not answer; ask the user to reload the page")
	case <-h.ctx.Done():
		return summaryAnswer{}, h.ctx.Err()
	}
}

func (h *Hub) summary(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Path string `json:"path"`
		Page string `json:"page"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 64<<10)).Decode(&req); err != nil || req.Path == "" {
		http.Error(w, "path required", http.StatusBadRequest)
		return
	}
	l, err := h.Summary(req.Path, req.Page)
	switch {
	case errors.Is(err, errNoScreen), errors.Is(err, errBusy):
		http.Error(w, err.Error(), http.StatusConflict)
	case err != nil:
		http.Error(w, err.Error(), http.StatusUnprocessableEntity)
	default:
		writeJSON(w, l)
	}
}

func (h *Hub) summaryAnswer(w http.ResponseWriter, r *http.Request) {
	var a summaryAnswer
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, maxBody)).Decode(&a); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	h.mu.Lock()
	ans := h.summaries[r.PathValue("req")]
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
