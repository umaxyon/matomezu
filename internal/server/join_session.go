package server

// 参加者と会話のセッションを結ぶ: join の MCP かフックが運ぶセッション id とプロセス id を参加者に結び、参加を伝えたかの印を持つ

import (
	"fmt"
	"os"
	"slices"

	"github.com/umaxyon/matomezu/internal/engine"
)

// noteJoinHost は参加者 id の常駐だけが持つ参加者の記録に、join の頼みに MCP が添えた AI のプログラムのプロセス id と、それが MCP を立てたときのセッション id を、
// 起こす知らせの宛て先として書く（どれも空なら書かない。プロセスが替わるとフックが移す。followHost）。要求中の間も残す（受け入れ・断りの知らせの宛て先。watch.go）。セッション id の結び直し（Host）には使わない。
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
	h.noteWakesLocked()
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
	h.noteWakesLocked()
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

// rebindByHost は、AI のプログラムのプロセス id が host で、セッション id が sessionID でない、参加（要求）中の参加者を、セッション sessionID に移す
// （AI のプログラムが同じまま、会話のセッションだけが変わったとき。Claude Code の /clear など）。join でセッション id を運んだ参加者は移さない。
// host か sessionID が空なら何もしない。移したか（置き場所には書かない。h.mu を持って呼ぶ）
func (h *Hub) rebindByHost(records []participantRecord, sessionID, host string) bool {
	if sessionID == "" || host == "" {
		return false
	}
	changed := false
	for _, s := range records {
		n := h.participantNotes[s.ID]
		if s.sitting() && n.Host == host && n.SessionID != sessionID && n.BoundBy != boundByJoin {
			h.carrySession(s.ID, sessionID, host)
			changed = true
		}
	}
	return changed
}

// rebindByPrevious は、まだ誰にも結ばれていないセッション sessionID が置き換えた前の会話のセッション id previous のどれかに結ばれた、参加（要求）中の参加者を、
// セッション sessionID に移す（Claude Desktop の /clear のように、AI のプログラムも替わるとき。前の会話は AI の側の部品が会話の記録から読む）。
// join でセッション id を運んだ参加者は移さない（rebindByHost と同じ）。移したか（置き場所には書かない。h.mu を持って呼ぶ）
func (h *Hub) rebindByPrevious(records []participantRecord, sessionID, host string, previous []string) bool {
	if sessionID == "" || len(previous) == 0 {
		return false
	}
	for _, s := range records {
		if s.sitting() && h.participantNotes[s.ID].SessionID == sessionID {
			return false
		}
	}
	changed := false
	for _, s := range records {
		n := h.participantNotes[s.ID]
		if s.sitting() && n.SessionID != "" && n.BoundBy != boundByJoin && slices.Contains(previous, n.SessionID) {
			h.carrySession(s.ID, sessionID, host)
			changed = true
		}
	}
	return changed
}

// carrySession は、参加者 id を前の会話からセッション sessionID に移す（host は AI のプログラムのプロセス id、分からなければ空）。
// 結んだ所は変えず、移したことを新しい会話の AI に伝える印を付ける。AI のプログラムが替わっていれば、起こす知らせの宛て先も移す（followHost。h.mu を持って呼ぶ）
func (h *Hub) carrySession(id, sessionID, host string) {
	n := h.participantNotes[id]
	h.bindSession(id, sessionID, n.BoundBy, host)
	n = h.participantNotes[id]
	n.Carried = true
	h.participantNotes[id] = n
	logWake("participant %s moved to session %q (host %q)", id, sessionID, host)
	h.followHost(id, sessionID, host, true)
}

// followHost は、セッション sessionID に結ばれた参加者 id の起こす知らせの宛て先を、そのセッションを動かす AI のプログラムのプロセス id host に移す
// （Claude Desktop は、会話の途中で CLI を --resume で起動し直し、/clear でも CLI ごと替える。どちらもプロセス id が変わる）。
// 移すのは、host が分かって今の宛て先と違い、今その参加者に届く通り道が無く、宛て先のセッションが sessionID か空か、前の会話から移したところ（moved）のときだけ
// （端末の /clear は同じプロセスのまま、通り道は AI のプログラムを立てたときのセッション id で開いているので、移すと届かなくなる）。
// 移すときは、古いプロセスで退室の見張りをしないよう、セッションと同じだけ生きるプロセスの印を消す（次の MCP の呼び出しが名乗り直す）。h.mu を持って呼ぶ
func (h *Hub) followHost(id, sessionID, host string, moved bool) {
	n := h.participantNotes[id]
	if host == "" || host == n.WakeHost || (!moved && n.WakeSession != "" && n.WakeSession != sessionID) || h.wakeReachLocked(id) == engine.WakeReaches {
		return
	}
	n.Host = host
	n.WakeHost, n.WakeSession = host, sessionID
	n.SessionPid, n.SessionPidSpace = "", ""
	h.participantNotes[id] = n
	logWake("participant %s is reached at host %q, session %q (hook)", id, host, sessionID)
	h.noteWakesLocked()
	h.signalWakes(id)
}

// followHosts は、セッション sessionID に結ばれた参加（要求）中の参加者の起こす知らせの宛て先を、host に移す（followHost）。移したか（置き場所には書かない。h.mu を持って呼ぶ）
func (h *Hub) followHosts(records []participantRecord, sessionID, host string) bool {
	if sessionID == "" || host == "" {
		return false
	}
	changed := false
	for _, s := range records {
		if !s.sitting() || h.participantNotes[s.ID].SessionID != sessionID {
			continue
		}
		before := h.participantNotes[s.ID].WakeHost
		h.followHost(s.ID, sessionID, host, false)
		changed = changed || h.participantNotes[s.ID].WakeHost != before
	}
	return changed
}

// CarrySession は、ターンの始まりに、会話のセッション sessionID（AI のプログラムのプロセス id host）へ参加者を移す: 同じプロセスの参加者（rebindByHost）と、
// 誰にも結ばれていなければ、前の会話 previous の参加者（rebindByPrevious）。結ばれた参加者の起こす知らせの宛て先も host に移す（followHosts）。
// 利用者トリガートークの数え直し（UserTalkedIn）より前に呼ぶ（移した参加者のラリーも数え直す）
func (h *Hub) CarrySession(sessionID, host string, previous []string) error {
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
	changed = h.rebindByPrevious(records, sessionID, host, previous) || changed
	changed = h.followHosts(records, sessionID, host) || changed
	if !changed {
		return nil
	}
	h.noteWakesLocked()
	return h.putParticipantNotes()
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
		h.noteWakesLocked()
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
