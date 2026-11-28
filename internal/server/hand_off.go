package server

// 利用者は、ワークルームの AI に、切りのよい所で引継ぎページを書いて会話を空にするよう頼める（HandOff。起こす知らせ wakeHandOff で、
// AI がリフレッシュリクエストのアクションを使う。従うか・いつかは AI 次第で、常駐は頼みの行く末を追わない）

import (
	"encoding/json"
	"io"
	"net/http"
	"slices"
)

// refreshAction は、頼まれた AI が使うリフレッシュリクエストのアクションの id
const refreshAction = "@matomezu/base:refresh-request"

// 頼めないときの理由
const (
	handOffNoRecipient    = "no-recipient"    // その参加者は、ワークルームに入っている参加の確定した AI でない
	handOffNotRefreshable = "not-refreshable" // その参加者の AI のプログラムが、会話を空にできると名乗っていない
)

// handOffLine は、引継ぎを書いて会話を空にするよう頼まれた AI に流す 1 行
func handOffLine() string {
	return `matomezu ` + asUserMark + `: the user pressed "Send the instruction to clear the context" on the matomezu screen. ` +
		`At a good point in your work, write the handoff page of your handoff target and have your conversation cleared with the action ` + refreshAction + `.`
}

// HandOff は、参加者 participant に、引継ぎページを書いて会話を空にするよう頼む（まだ渡せたと返っていない前の頼みがあれば、新しくは足さない）。
// 頼めなければ、その理由（handOffNoRecipient・handOffNotRefreshable）を返す（頼んだら空）
func (h *Hub) HandOff(participant string) (refused string, err error) {
	h.mu.Lock()
	defer h.mu.Unlock()
	records, err := h.participantsHeld()
	if err != nil {
		return "", err
	}
	occupants := h.occupants(records)
	if participant == "" || !slices.ContainsFunc(records, func(r participantRecord) bool {
		return r.ID == participant && occupants[r.Workroom] == participant
	}) {
		return handOffNoRecipient, nil
	}
	if !h.participantNotes[participant].Refreshable {
		return handOffNotRefreshable, nil
	}
	if !slices.ContainsFunc(h.wakeQueue[participant], func(it wakeItem) bool { return it.kind == wakeHandOff }) {
		h.enqueueWake(wakeItem{participant: participant, kind: wakeHandOff, line: handOffLine()})
	}
	return "", nil
}

// handOff は、画面の口: 参加者に、引継ぎページを書いて会話を空にするよう頼む。頼めなければ { ok: false, reason }
func (o Options) handOff(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Participant string `json:"participant"`
	}
	if err := json.NewDecoder(io.LimitReader(r.Body, maxBody)).Decode(&req); err != nil || req.Participant == "" {
		http.Error(w, "the body must be {\"participant\"}", http.StatusBadRequest)
		return
	}
	refused, err := o.Hub.HandOff(req.Participant)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if refused != "" {
		writeJSON(w, map[string]any{"ok": false, "reason": refused})
		return
	}
	writeJSON(w, map[string]any{"ok": true})
}
