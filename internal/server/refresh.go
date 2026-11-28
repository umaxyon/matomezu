package server

import (
	"fmt"
	"net/http"
	"os"
	"strings"

	"github.com/umaxyon/matomezu/internal/engine"
)

// refreshHead は、リフレッシュリクエストの文の頭（AI のプログラムが空にしたあとの新しい会話に打つ。利用者の話には数えない）
const refreshHead = "matomezu: "

// refreshRefused は、リフレッシュリクエスト req を、参加者 participant の頼みとして受けられないときの断り（受けられる・頼みが無いなら nil）。
// 受けるのは、結んだ会話の AI のプログラムが、会話を空にできると名乗った参加者だけ（h.mu を持って呼ぶ）
func (h *Hub) refreshRefused(req *engine.RefreshRequest, participant string) *Performed {
	if req == nil || h.participantNotes[participant].Refreshable {
		return nil
	}
	return &Performed{OK: false, Reason: "refused", Detail: "your AI program has not told matomezu that it can have its conversation cleared (Claude Code with the matomezu plugin can), so nothing was written"}
}

// keepRefresh は、受けたリフレッシュリクエスト req を参加者 participant に覚える（前の頼みは置き換える。h.mu を持って呼ぶ）。
// バルクはもう書いたので、覚えを置き場所に書けなくても断らず、覚えを前に戻して stderr に出す（引継ぎページは書けている。会話は空にならない）
func (h *Hub) keepRefresh(req *engine.RefreshRequest, participant string) {
	if req == nil || participant == "" {
		return
	}
	was := h.participantNotes[participant]
	n := was
	n.RefreshDue = refreshHead + req.Text
	n.RefreshLent = ""
	h.participantNotes[participant] = n
	if err := h.putParticipantNotes(); err != nil {
		h.participantNotes[participant] = was
		fmt.Fprintf(os.Stderr, "%s the refresh request of %s is not kept: %v\n", stamp(), participant, err)
	}
}

// NoteRefreshable は、会話のセッション session に結んだ参加者に、その AI のプログラムが会話を空にできると名乗ったことを覚える
func (h *Hub) NoteRefreshable(session string) error {
	id := h.joinedOfSession(session)
	if id == "" {
		return nil
	}
	h.mu.Lock()
	defer h.mu.Unlock()
	n, ok := h.participantNotes[id]
	if !ok || n.Refreshable {
		return nil
	}
	n.Refreshable = true
	h.participantNotes[id] = n
	return h.putParticipantNotes()
}

// TakeRefresh は、会話のセッション session に結んだ参加者が受けたリフレッシュリクエストの文（無ければ空）。渡したら RefreshLent へ移し
// （空にしたあとの会話が始まるまで残す。RefreshStarted）、空にしたあとの新しい会話がその文で始まるターンを、知らせで始まったと見る（rememberLent）
func (h *Hub) TakeRefresh(session string) (string, error) {
	id := h.joinedOfSession(session)
	if id == "" {
		return "", nil
	}
	h.mu.Lock()
	defer h.mu.Unlock()
	n := h.participantNotes[id]
	if n.RefreshDue == "" {
		return "", nil
	}
	text := n.RefreshDue
	n.RefreshDue = ""
	n.RefreshLent = text
	h.participantNotes[id] = n
	if err := h.putParticipantNotes(); err != nil {
		return "", err
	}
	h.rememberLent(text)
	return text, nil
}

// aiRefreshDue は、AI のプログラムの部品がターンの終わりに訊く、そのセッションが受けたリフレッシュリクエストの文（{"text"}。無ければ空）
func (o Options) aiRefreshDue(w http.ResponseWriter, r *http.Request) {
	var req struct {
		SessionID string `json:"sessionId"`
	}
	if !readJSON(w, r, &req) {
		return
	}
	text, err := o.Hub.TakeRefresh(req.SessionID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, struct {
		Text string `json:"text"`
	}{text})
}

// RefreshStarted は、ターンの入力 prompt が、部品に渡したリフレッシュリクエストの文（RefreshLent）なら、その参加者の会話は空になったと見て消す
// （空にしたあとの会話は新しいセッションなので、文で参加者を引く。文は引継ぎページの id を持つので、ほかの参加者の物と重ならない）
func (h *Hub) RefreshStarted(prompt string) error {
	prompt = strings.TrimSpace(prompt)
	if prompt == "" {
		return nil
	}
	h.mu.Lock()
	defer h.mu.Unlock()
	for id, n := range h.participantNotes {
		if n.RefreshLent == "" || n.RefreshLent != prompt {
			continue
		}
		n.RefreshLent = ""
		h.participantNotes[id] = n
		return h.putParticipantNotes()
	}
	return nil
}

// refreshFailedText は、部品に渡したのに空にしたあとの会話が始まらなかったとき、ターンの終わりに AI に 1 度だけ渡す文
const refreshFailedText = "Your conversation could not be cleared after the handoff page was written. Tell the user, in the user's language: the conversation could not be cleared; if the amount of context matters, run /clear."

// HandoffDue は、会話のセッション session に結んだ参加者が、ターンを終える前にする事（AI に渡す英語の文。無ければ空）。
// 会話を空にできると名乗った参加者だけ: 部品に渡したのに空にならなかった頼みがあれば、それを伝える文（1 度だけ。渡したら消す）。
// 空にする頼みをまだ部品が受け取っていなければ空（このターンの終わりに空になる）。でなければ、ワークルームの引継ぎ対象チケットの引継ぎページの頼み（エンジンの HandoffDue）
func (h *Hub) HandoffDue(session string) (string, error) {
	id := h.joinedOfSession(session)
	if id == "" {
		return "", nil
	}
	h.mu.Lock()
	defer h.mu.Unlock()
	n := h.participantNotes[id]
	if !n.Refreshable || n.RefreshDue != "" {
		return "", nil
	}
	if n.RefreshLent != "" {
		n.RefreshLent = ""
		h.participantNotes[id] = n
		if err := h.putParticipantNotes(); err != nil {
			return "", err
		}
		return refreshFailedText, nil
	}
	room := h.actorOfParticipantHeld(id).Workroom
	if room == "" {
		return "", nil
	}
	return h.engine.HandoffDue(room, recordSource{h})
}

// aiHandoffDue は、ターンの終わりのフックが訊く、そのセッションの AI がターンを終える前にする事（{"text"}。無ければ空。HandoffDue）
func (o Options) aiHandoffDue(w http.ResponseWriter, r *http.Request) {
	var req struct {
		SessionID string `json:"sessionId"`
	}
	if !readJSON(w, r, &req) {
		return
	}
	text, err := o.Hub.HandoffDue(req.SessionID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, struct {
		Text string `json:"text"`
	}{text})
}
