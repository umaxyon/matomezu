package server

// AI のコンテキストの量の知らせ: AI のフック（Claude Code の PostToolUse・Stop・SessionStart・PostModelSwitch）が、会話のセッションの今のコンテキストの量と、
// AI の側の物差し（自動で縮める所、無ければモデルの上限）を常駐に知らせる。セッション id ごとにメモリで持ち（置き場所に書かない）、
// そのセッション id が結ばれた参加者の様子（participant-live と /api/data）に載せる。読めないと知らされたら消す（棒を出さない）。
// 値が変わったときと、参加者にそのセッションが結ばれた・結び直されたときに窓に知らせ、同じ値なら知らせない。
// host が添えてあれば、先に、同じ AI のプログラムのプロセス id の参加者にそのセッション id を結び直す（model.go と同じ）。
// 量のうち matomezu が使っている分の目安（byMatomezu）は、フックが会話の記録の字数の割合から出す。フックが続きから読めるように、常駐はセッションごとに、
// 中を見ない印（mark）と、そこまでに積んだ字数（chars）を持つ。フックは先に askMark で受け取り、読み始めた印（from）を添えて返す。
// 常駐は from が今の印と合うときだけ入れる（並んで走ったフックが、同じ所から読んだ分を古い値で上書きしない）。起動し直すと印は無く、フックは頭から読み直す。
//
//	POST /api/ai/context-use  {"sessionId", "askMark": true}  {"mark", "chars": {"total", "matomezu"}} を返す（印が無ければ空と 0）
//	POST /api/ai/context-use  {"sessionId", "host", "contextUse": {"used", "aiScale", "byMatomezu"?} か "unknown", "from"?, "mark"?, "chars"?}  {} を返す
//	                          （mark があれば、from が今の印と合うときだけ、量と印と字数を入れる。合わなければ何も変えない）

import (
	"encoding/json"
	"net/http"
	"time"
)

// contextUse は、会話のセッション 1 つの今のコンテキストの量（used）と AI の側の物差し（aiScale）と、量のうち matomezu が使っている分の目安
// （byMatomezu。分からなければ 0 で、省く）。どれもトークン
type contextUse struct {
	Used       int64 `json:"used"`
	AIScale    int64 `json:"aiScale"`
	ByMatomezu int64 `json:"byMatomezu,omitempty"`
}

// contextChars は、会話の記録の中身の字数（total）と、そのうち matomezu が足した分（matomezu）
type contextChars struct {
	Total    int64 `json:"total"`
	Matomezu int64 `json:"matomezu"`
}

// contextMark は、フックが次に会話の記録を読み始める印（中は見ない）と、そこまでに積んだ字数
type contextMark struct {
	Mark  string       `json:"mark"`
	Chars contextChars `json:"chars"`
}

// noContextUse は、量か物差しが分からない（知らされていない・読めないと知らされた）ときの値
var noContextUse = contextUse{}

// contextUnknown は、フックが量か物差しを読めなかったときに contextUse に書く値
const contextUnknown = "unknown"

// heardContext は、フックが知らせたコンテキストの量と、読み始める印と積んだ字数と、知らせた時点
type heardContext struct {
	use  contextUse
	mark contextMark
	at   time.Time
}

const (
	// heardContextsMax は、覚えておく、参加者に結ばれていないセッションのコンテキストの量の数の上限（超えたら知らせた時点の古いものから捨てる）
	heardContextsMax = 256
	// heardContextKeep は、参加者に結ばれていないセッションのコンテキストの量を、知らされないまま覚えておく長さ
	heardContextKeep = 24 * time.Hour
)

// contextOfLocked は、セッション sessionID の今のコンテキストの量（分からなければ noContextUse。h.mu を持って呼ぶ）
func (h *Hub) contextOfLocked(sessionID string) contextUse {
	if sessionID == "" {
		return noContextUse
	}
	if c, ok := h.heardContexts[sessionID]; ok {
		return c.use
	}
	return noContextUse
}

// HeardContextUse は、セッション sessionID の今のコンテキストの量が use（分からなければ noContextUse）だと、時点 now にフックが知らせたことを受ける。
// 読み始める印と積んだ字数は変えない。sessionID が空なら何もしない
func (h *Hub) HeardContextUse(sessionID, host string, use contextUse, now time.Time) error {
	return h.heardContextUse(sessionID, host, use, nil, now)
}

// markedRead は、フックが読み始めた印 from と、読んだあとの印と積んだ字数 next
type markedRead struct {
	from string
	next contextMark
}

// HeardContextRead は、HeardContextUse に、フックが印 from から読んで積んだ next を添えた物。from が今の印と合わなければ何も変えない
func (h *Hub) HeardContextRead(sessionID, host string, use contextUse, from string, next contextMark, now time.Time) error {
	return h.heardContextUse(sessionID, host, use, &markedRead{from: from, next: next}, now)
}

// ContextMark は、セッション sessionID の、フックが次に読み始める印と積んだ字数（無ければ空と 0）
func (h *Hub) ContextMark(sessionID string) contextMark {
	h.mu.Lock()
	defer h.mu.Unlock()
	return h.heardContexts[sessionID].mark
}

func (h *Hub) heardContextUse(sessionID, host string, use contextUse, read *markedRead, now time.Time) error {
	if sessionID == "" {
		return nil
	}
	records, err := h.records()
	if err != nil {
		return err
	}
	h.mu.Lock()
	defer h.mu.Unlock()
	changed := h.rebindByHost(records, sessionID, host)
	changed = h.followHosts(records, sessionID, host) || changed
	held := h.heardContexts[sessionID]
	if read == nil || read.from == held.mark.Mark {
		mark := held.mark
		if read != nil {
			mark = read.next
		}
		h.rememberContext(sessionID, heardContext{use: use, mark: mark, at: now}, now)
		if held.use != use {
			for id, n := range h.participantNotes {
				if n.SessionID == sessionID {
					h.announceLive(id)
				}
			}
		}
	}
	if !changed {
		return nil
	}
	return h.putParticipantNotes()
}

// rememberContext は、セッション sessionID の知らせ heard を覚える（量も印も無ければ忘れる）。参加者に結ばれていないセッションのうち、
// 古くなったものを捨て、上限を超えたら知らせた時点の古いものから捨てる（結ばれたセッションの物は、窓に出ているので捨てない。h.mu を持って呼ぶ）
func (h *Hub) rememberContext(sessionID string, heard heardContext, now time.Time) {
	if h.heardContexts == nil {
		h.heardContexts = map[string]heardContext{}
	}
	if heard.use == noContextUse && heard.mark == (contextMark{}) {
		delete(h.heardContexts, sessionID)
	} else {
		h.heardContexts[sessionID] = heard
	}
	bound := map[string]bool{}
	for _, n := range h.participantNotes {
		if n.SessionID != "" {
			bound[n.SessionID] = true
		}
	}
	loose := 0
	for id, c := range h.heardContexts {
		switch {
		case bound[id]:
		case now.Sub(c.at) > heardContextKeep:
			delete(h.heardContexts, id)
		default:
			loose++
		}
	}
	for ; loose > heardContextsMax; loose-- {
		oldest := ""
		for id, c := range h.heardContexts {
			if !bound[id] && (oldest == "" || c.at.Before(h.heardContexts[oldest].at)) {
				oldest = id
			}
		}
		delete(h.heardContexts, oldest)
	}
}

// readContextUse は、POST /api/ai/context-use の contextUse を読む（"unknown" か、量か物差しが正でない物は noContextUse。形に合わなければ ok が偽）
func readContextUse(raw json.RawMessage) (contextUse, bool) {
	var word string
	if json.Unmarshal(raw, &word) == nil {
		return noContextUse, word == contextUnknown
	}
	var use contextUse
	if json.Unmarshal(raw, &use) != nil {
		return noContextUse, false
	}
	if use.Used < 0 || use.AIScale <= 0 {
		return noContextUse, true
	}
	use.ByMatomezu = min(max(use.ByMatomezu, 0), use.Used)
	return use, true
}

// aiContextUse は、AI のフックが知らせたセッションのコンテキストの量を受ける（{"sessionId", "host", "contextUse", "from"?, "mark"?, "chars"?}）。
// askMark なら、読み始める印と積んだ字数を返す
func (o Options) aiContextUse(w http.ResponseWriter, r *http.Request) {
	var req struct {
		SessionID  string          `json:"sessionId"`
		Host       string          `json:"host"`
		AskMark    bool            `json:"askMark"`
		ContextUse json.RawMessage `json:"contextUse"`
		From       string          `json:"from"`
		Mark       *string         `json:"mark"`
		Chars      contextChars    `json:"chars"`
	}
	if !readJSON(w, r, &req) {
		return
	}
	if req.AskMark {
		writeJSON(w, o.Hub.ContextMark(req.SessionID))
		return
	}
	use, ok := readContextUse(req.ContextUse)
	if !ok {
		http.Error(w, "contextUse is neither {used, aiScale} nor \"unknown\"", http.StatusBadRequest)
		return
	}
	var err error
	if req.Mark != nil {
		err = o.Hub.HeardContextRead(req.SessionID, req.Host, use, req.From, contextMark{Mark: *req.Mark, Chars: req.Chars}, time.Now())
	} else {
		err = o.Hub.HeardContextUse(req.SessionID, req.Host, use, time.Now())
	}
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, map[string]any{})
}
