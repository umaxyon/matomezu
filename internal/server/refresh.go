package server

import (
	"fmt"
	"net/http"
	"os"

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
	h.participantNotes[participant] = n
	if err := h.putParticipantNotes(); err != nil {
		h.participantNotes[participant] = was
		fmt.Fprintf(os.Stderr, "%s the refresh request of %s is not kept: %v\n", stamp(), participant, err)
	}
}

// DropRefresh は、会話のセッション session に結んだ参加者が受けたリフレッシュリクエストを捨てる（利用者が話したら、そのターンの終わりの頼みではもう無い。
// AI のプログラムの部品が動かず渡せなかった頼みが、後の関係の無い会話を空にしないため）
func (h *Hub) DropRefresh(session string) error {
	id := h.joinedOfSession(session)
	if id == "" {
		return nil
	}
	h.mu.Lock()
	defer h.mu.Unlock()
	n, ok := h.participantNotes[id]
	if !ok || n.RefreshDue == "" {
		return nil
	}
	n.RefreshDue = ""
	h.participantNotes[id] = n
	return h.putParticipantNotes()
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
	if err := h.putParticipantNotes(); err != nil {
		return err
	}
	h.announceLive(id)
	return nil
}

// TakeRefresh は、会話のセッション session に結んだ参加者が受けたリフレッシュリクエストの文（無ければ空）。渡したら消し、
// 空にしたあとの新しい会話がその文で始まるターンを、知らせで始まったと見る（rememberLent）
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
