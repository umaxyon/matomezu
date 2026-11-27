package server

// AI のコンテキストの量の知らせ: AI のフック（Claude Code の PostToolUse・Stop・SessionStart・PostModelSwitch）が、会話のセッションの今のコンテキストの量と、
// AI の側の物差し（自動で縮める所、無ければモデルの上限）を常駐に知らせる。セッション id ごとにメモリで持ち（置き場所に書かない）、
// そのセッション id が結ばれた参加者の様子（participant-live と /api/data）に載せる。読めないと知らされたら消す（棒を出さない）。
// 値が変わったときと、参加者にそのセッションが結ばれた・結び直されたときに窓に知らせ、同じ値なら知らせない。
// host が添えてあれば、先に、同じ AI のプログラムのプロセス id の参加者にそのセッション id を結び直す（model.go と同じ）。
//
//	POST /api/ai/context-use  {"sessionId", "host", "contextUse": {"used", "aiScale"} か "unknown"}  {} を返す

import (
	"encoding/json"
	"net/http"
	"time"
)

// contextUse は、会話のセッション 1 つの今のコンテキストの量（used）と AI の側の物差し（aiScale）。どちらもトークン
type contextUse struct {
	Used    int64 `json:"used"`
	AIScale int64 `json:"aiScale"`
}

// noContextUse は、量か物差しが分からない（知らされていない・読めないと知らされた）ときの値
var noContextUse = contextUse{}

// contextUnknown は、フックが量か物差しを読めなかったときに contextUse に書く値
const contextUnknown = "unknown"

// heardContext は、フックが知らせたコンテキストの量と、知らせた時点
type heardContext struct {
	use contextUse
	at  time.Time
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
// sessionID が空なら何もしない
func (h *Hub) HeardContextUse(sessionID, host string, use contextUse, now time.Time) error {
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
	if h.contextOfLocked(sessionID) != use {
		h.rememberContext(sessionID, use, now)
		for id, n := range h.participantNotes {
			if n.SessionID == sessionID {
				h.announceLive(id)
			}
		}
	} else if use != noContextUse {
		h.rememberContext(sessionID, use, now)
	}
	if !changed {
		return nil
	}
	return h.putParticipantNotes()
}

// rememberContext は、セッション sessionID のコンテキストの量を覚える（noContextUse なら忘れる）。参加者に結ばれていないセッションのうち、
// 古くなったものを捨て、上限を超えたら知らせた時点の古いものから捨てる（結ばれたセッションの物は、窓に出ているので捨てない。h.mu を持って呼ぶ）
func (h *Hub) rememberContext(sessionID string, use contextUse, now time.Time) {
	if h.heardContexts == nil {
		h.heardContexts = map[string]heardContext{}
	}
	if use == noContextUse {
		delete(h.heardContexts, sessionID)
	} else {
		h.heardContexts[sessionID] = heardContext{use: use, at: now}
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
	return use, true
}

// aiContextUse は、AI のフックが知らせたセッションのコンテキストの量を受ける（{"sessionId", "host", "contextUse"}）
func (o Options) aiContextUse(w http.ResponseWriter, r *http.Request) {
	var req struct {
		SessionID  string          `json:"sessionId"`
		Host       string          `json:"host"`
		ContextUse json.RawMessage `json:"contextUse"`
	}
	if !readJSON(w, r, &req) {
		return
	}
	use, ok := readContextUse(req.ContextUse)
	if !ok {
		http.Error(w, "contextUse is neither {used, aiScale} nor \"unknown\"", http.StatusBadRequest)
		return
	}
	if err := o.Hub.HeardContextUse(req.SessionID, req.Host, use, time.Now()); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, map[string]any{})
}
