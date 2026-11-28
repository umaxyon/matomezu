package server

// AI のモデルの知らせ: AI のフック（Claude Code の SessionStart と PostModelSwitch）が、会話のセッションのモデルを常駐に知らせる。
// そのセッション id が結ばれた参加者の記録にモデルを書き、窓に知らせる。まだ誰にも結ばれていなければ、セッション id ごとにメモリで覚えておき、
// 結ばれたとき（join で MCP が運んだか、UserPromptSubmit のフックが結んだか、AI のプログラムのプロセス id で結び直したか）に参加者の記録へ移す。
// host が添えてあれば、先に、同じAI のプログラムのプロセス id の参加者にそのセッション id を結び直す（talk_session.go の結び直しと同じ）。
//
//	POST /api/ai/model  {"sessionId", "model", "host"}  {} を返す

import (
	"net/http"
	"time"
)

// heardModel は、誰にも結ばれていないセッションについて、フックが知らせたモデルと、知らせた時点
type heardModel struct {
	model string
	at    time.Time
}

const (
	// heardModelsMax は、覚えておく、結ばれていないセッションのモデルの数の上限（超えたら古いものから捨てる）
	heardModelsMax = 64
	// heardModelKeep は、結ばれていないセッションのモデルを覚えておく長さ
	heardModelKeep = 24 * time.Hour
)

// HeardModel は、セッション sessionID のモデルが model だと、時点 now にフックが知らせたことを受ける。
// sessionID が空なら何もしない。model が空なら、AI のプログラムのプロセス id での結び直しと、送り先エッジの移し（followHosts）だけを行う
func (h *Hub) HeardModel(sessionID, model, host string, now time.Time) error {
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
	if model != "" {
		bound := false
		for id, n := range h.participantNotes {
			if n.SessionID != sessionID {
				continue
			}
			bound = true
			if n.Model != model {
				n.Model = model
				h.participantNotes[id] = n
				h.announceLive(id)
				changed = true
			}
		}
		if !bound {
			h.rememberModel(sessionID, model, now)
		}
	}
	if !changed {
		return nil
	}
	return h.putParticipantNotes()
}

// rememberModel は、誰にも結ばれていないセッション sessionID のモデルを覚える。古くなったものを捨て、上限を超えたら知らせた時点の古いものから捨てる（h.mu を持って呼ぶ）
func (h *Hub) rememberModel(sessionID, model string, now time.Time) {
	if h.heardModels == nil {
		h.heardModels = map[string]heardModel{}
	}
	for id, m := range h.heardModels {
		if now.Sub(m.at) > heardModelKeep {
			delete(h.heardModels, id)
		}
	}
	h.heardModels[sessionID] = heardModel{model: model, at: now}
	for len(h.heardModels) > heardModelsMax {
		oldest := ""
		for id, m := range h.heardModels {
			if oldest == "" || m.at.Before(h.heardModels[oldest].at) {
				oldest = id
			}
		}
		delete(h.heardModels, oldest)
	}
}

// aiModel は、AI のフックが知らせたセッションのモデルを受ける（{"sessionId", "model", "host", "hostSpace"}）
func (o Options) aiModel(w http.ResponseWriter, r *http.Request) {
	var req struct {
		SessionID string `json:"sessionId"`
		Model     string `json:"model"`
		Host      string `json:"host"`
		HostSpace string `json:"hostSpace"` // host が通じるプロセス id の範囲の印
	}
	if !readJSON(w, r, &req) {
		return
	}
	o.Hub.NoteLaterSession(req.SessionID, req.Host, req.HostSpace)
	if err := o.Hub.HeardModel(req.SessionID, req.Model, req.Host, time.Now()); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, map[string]any{})
}
