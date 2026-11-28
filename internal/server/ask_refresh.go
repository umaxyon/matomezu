package server

// 利用者は、ワークルームの AI に、切りのよい所で引継ぎページを書いて会話を空にするよう頼める（AskRefresh。起こす知らせ wakeAskRefresh で、
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
	askRefreshNoRecipient    = "no-recipient"    // その参加者は、ワークルームに入っている参加の確定した AI でない
	askRefreshNotRefreshable = "not-refreshable" // その参加者の AI のプログラムが、会話を空にできると名乗っていない
)

// askRefreshLine は、引継ぎを書いて会話を空にするよう頼まれた AI に流す 1 行
func askRefreshLine() string {
	return `matomezu ` + asUserMark + `: the user pressed "Send the instruction to clear the context" on the matomezu screen. ` +
		`At a good point in your work, use the action ` + refreshAction + ` to write the handoff page (into the worker book of your handoff target, or of your current work when there is none) and have your conversation cleared.`
}

// AskRefresh は、参加者 participant に、引継ぎページを書いて会話を空にするよう頼む（まだ渡せたと返っていない前の頼みがあれば、新しくは足さない）。
// 頼めなければ、その理由（askRefreshNoRecipient・askRefreshNotRefreshable）を返す（頼んだら空）
func (h *Hub) AskRefresh(participant string) (refused string, err error) {
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
		return askRefreshNoRecipient, nil
	}
	if !h.participantNotes[participant].Refreshable {
		return askRefreshNotRefreshable, nil
	}
	if !slices.ContainsFunc(h.wakeQueue[participant], func(it wakeItem) bool { return it.kind == wakeAskRefresh }) {
		h.enqueueWake(wakeItem{participant: participant, kind: wakeAskRefresh, line: askRefreshLine()})
	}
	return "", nil
}

// askRefresh は、画面の口: 参加者に、引継ぎページを書いて会話を空にするよう頼む。頼めなければ { ok: false, reason }
func (o Options) askRefresh(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Participant string `json:"participant"`
	}
	if err := json.NewDecoder(io.LimitReader(r.Body, maxBody)).Decode(&req); err != nil || req.Participant == "" {
		http.Error(w, "the body must be {\"participant\"}", http.StatusBadRequest)
		return
	}
	refused, err := o.Hub.AskRefresh(req.Participant)
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
