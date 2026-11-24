package server

// 参加者と会話のセッションを結ぶ: join の MCP かフックが運ぶセッション id とプロセス id を参加者に結び、参加を伝えたかの印を持つ

import (
	"fmt"
	"os"
	"slices"
)

// noteJoinHost は参加者 id の常駐だけが持つ参加者の記録に、join の頼みに MCP が添えた AI のプログラムのプロセス id と、それが MCP を立てたときのセッション id を、
// 起こす知らせの宛て先として書く（どれも空なら書かない）。要求中の間も残す（受け入れ・断りの知らせの宛て先。watch.go）。セッション id の結び直し（Host）には使わない。
// MCP がセッションのプロセスを名乗っていれば、退室の見張りの宛てとしてその id と範囲の印も書く
func (h *Hub) noteJoinHost(id string, req JoinRequest) {
	if req.Host == "" && req.HostSession == "" && req.SessionPid == "" {
		return
	}
	h.mu.Lock()
	defer h.mu.Unlock()
	n := h.participantNotes[id]
	if req.Host != "" || req.HostSession != "" {
		n.WakeHost = req.Host
		n.WakeSession = req.HostSession
		logWake("participant %s is reached at host %q, session %q (join)", id, req.Host, req.HostSession)
	}
	if req.SessionPid != "" {
		n.SessionPid, n.SessionPidSpace = req.SessionPid, req.SessionPidSpace
	}
	h.participantNotes[id] = n
}

// noteSession は参加者 id の常駐だけが持つ参加者の記録に、join で MCP が運んだセッション id を結ぶ（空なら何もしない）。
// 運んだ AI は準備中にならないので、窓に知らせる
func (h *Hub) noteSession(id, sessionID string) {
	if sessionID == "" {
		return
	}
	h.mu.Lock()
	defer h.mu.Unlock()
	h.bindSession(id, sessionID, boundByJoin, "")
	h.broadcast("participant-ready", map[string]any{"participant": id})
	h.kickRooms()
}

// bindSession は、参加者 id にセッション id sessionID を、結んだ所 by で結ぶ。host が空でなければAI のプログラムのプロセス id も書く。
// そのセッションについてフックが先に知らせたモデルを覚えていれば、参加者の記録に移す。覚えていなくても、同じセッションのほかの参加者がモデルを持っていれば、それを写す。
// モデルが変わったら窓に知らせる。置き場所には書かない（h.mu を持って呼ぶ）
func (h *Hub) bindSession(id, sessionID, by, host string) {
	n := h.participantNotes[id]
	n.SessionID = sessionID
	n.BoundBy = by
	if host != "" {
		n.Host = host
	}
	model := ""
	if heard, ok := h.heardModels[sessionID]; ok {
		model = heard.model
		delete(h.heardModels, sessionID)
	} else {
		for other, o := range h.participantNotes {
			if other != id && o.SessionID == sessionID && o.Model != "" {
				model = o.Model
				break
			}
		}
	}
	moved := model != "" && model != n.Model
	if moved {
		n.Model = model
	}
	h.participantNotes[id] = n
	if moved {
		h.announceLive(id)
	}
}

// rebindByHost は、AI のプログラムのプロセス id が host で、セッション id が sessionID でない、参加（要求）中の参加者に、セッション id sessionID を結び直す
// （AI のプログラムが同じまま、会話のセッションだけが変わったとき。Claude Code の /clear など）。join でセッション id を運んだ参加者は結び直さない。結んだ所と伝えた印は変えない。
// host か sessionID が空なら何もしない。結び直したか（置き場所には書かない。h.mu を持って呼ぶ）
func (h *Hub) rebindByHost(records []participantRecord, sessionID, host string) bool {
	if sessionID == "" || host == "" {
		return false
	}
	changed := false
	for _, s := range records {
		n := h.participantNotes[s.ID]
		if s.sitting() && n.Host == host && n.SessionID != sessionID && n.BoundBy != boundByJoin {
			h.bindSession(s.ID, sessionID, n.BoundBy, host)
			changed = true
		}
	}
	return changed
}

// ParticipantReady は、準備中でない参加者の id（窓が、受け入れ済みの参加者の準備中を見分ける）
func (h *Hub) ParticipantReady() []string {
	h.mu.Lock()
	defer h.mu.Unlock()
	out := []string{}
	for id, n := range h.participantNotes {
		if n.ready() {
			out = append(out, id)
		}
	}
	slices.Sort(out)
	return out
}

// settleNotes は参加者の表に無い常駐だけが持つ参加者の記録を捨て、常駐だけが持つ参加者の記録を置き場所に書く
func (h *Hub) settleNotes() error {
	records, err := h.records()
	if err != nil {
		return err
	}
	h.mu.Lock()
	defer h.mu.Unlock()
	known := map[string]bool{}
	for _, s := range records {
		known[s.ID] = true
	}
	for id := range h.participantNotes {
		if !known[id] {
			delete(h.participantNotes, id)
		}
	}
	return h.putParticipantNotes()
}

// SessionParticipant は、セッション id session が結ばれた参加者の id。受け入れ済みで準備中でない参加者が、ちょうど 1 人のときだけ返す（ほかは空。
// フックは会話に出た link の参加者のどれにも同じセッション id を結ぶので、1 人に決まらなければ選ばない）。
// 返すときは、起こす知らせの宛て先を、この呼び出しの AI のプログラムのプロセス id host とセッション id に書き直す（起動し直した AI のプログラムは、プロセス id が変わる）
func (h *Hub) SessionParticipant(session, host string) string {
	if session == "" {
		return ""
	}
	records, err := h.records()
	if err != nil {
		return ""
	}
	h.mu.Lock()
	defer h.mu.Unlock()
	found := h.sessionParticipantHeld(records, session)
	if found == "" {
		return ""
	}
	n := h.participantNotes[found]
	if n.WakeHost != host || n.WakeSession != session {
		n.WakeHost, n.WakeSession = host, session
		logWake("participant %s is reached at host %q, session %q (hook)", found, host, session)
		h.participantNotes[found] = n
		if err := h.putParticipantNotes(); err != nil {
			fmt.Fprintln(os.Stderr, "could not save the wake target of participant", found, ":", err)
		}
		h.signalWakes(found)
	}
	return found
}

// sessionParticipantHeld は、参加者 records のうち、会話のセッション session に結んだ、受け入れ済みで準備中でない参加者の id（無いか、2 人以上なら空。h.mu を持って呼ぶ）
func (h *Hub) sessionParticipantHeld(records []participantRecord, session string) string {
	found := ""
	for _, s := range records {
		if n := h.participantNotes[s.ID]; n.SessionID != session || !s.accepted() || !n.ready() {
			continue
		}
		if found != "" {
			return ""
		}
		found = s.ID
	}
	return found
}
