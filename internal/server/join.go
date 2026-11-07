package server

// AI の参加: AI（MCP の join）が参加を頼む口と、参加者ごとの帳簿。
// 参加を頼むと、参加者を作るアクションと、利用者に知らせる郵便のアクションを、この順に行う（どのアクションかは、アクションの定義が runsWhenAIJoins で名乗る）。
// 参加者の表と郵便箱はアクションの結果が持つ。ここが持つ帳簿はアクションを通さない記録で、参加者の id ごとに
//   - 最後に呼ばれた時刻（参加の id の付いた /api/ai の呼び出しのたびに更新。置き場所には書かず、窓にも知らせない）
//   - セッション id（join のときに MCP が添える。置き場所に残す）
//   - 参加を伝えたかの印（置き場所に残す。伝えたのは、参加の id の付いた呼び出しへの返事のヘッダ）
//
// 参加の id は MCP が X-Matomezu-Participant ヘッダで毎回添え、「参加しました」の知らせは X-Matomezu-Notice ヘッダで 1 度だけ返す（値は URL エンコード）。
//
//	POST /api/ai/join  {"ai", "model", "env", "sessionName", "link", "sessionId"} 参加を頼む。{"ok", "participant"}、または弾いた理由 {"ok": false, "reason", "detail"}

import (
	"encoding/json"
	"net/http"
	"net/url"
	"time"
)

const (
	// ParticipantHeader は、MCP が参加の id を添えるヘッダ
	ParticipantHeader = "X-Matomezu-Participant"
	// NoticeHeader は、常駐が AI への知らせを返すヘッダ（値は URL エンコード）
	NoticeHeader = "X-Matomezu-Notice"
)

// participantNote は参加者 1 人の帳簿
type participantNote struct {
	SessionID string `json:"sessionId,omitempty"` // join のときに MCP が添えたセッション id
	Told      bool   `json:"told,omitempty"`      // 参加（joined）を AI に伝えた
	Called    string `json:"-"`                   // 最後に呼ばれた時点（残さない）
}

// seat は参加者の表の 1 人のうち、join が見る所
type seat struct {
	ID          string `json:"id"`
	State       string `json:"state"`
	AI          string `json:"ai"`
	Env         string `json:"env"`
	SessionName string `json:"sessionName"`
	Link        string `json:"link"`
	Workroom    string `json:"workroom"`
}

// JoinRequest は AI の参加の頼み。Participant は呼び出しに付いていた参加の id（無ければ空）
type JoinRequest struct {
	AI          string `json:"ai"`
	Model       string `json:"model"`
	Env         string `json:"env"`
	SessionName string `json:"sessionName"`
	Link        string `json:"link"`
	SessionID   string `json:"sessionId"`
	Participant string `json:"-"`
}

// Joined は参加の頼みの結果。弾いたり断られたりしたら OK は false で、Reason と Detail に理由
type Joined struct {
	OK          bool   `json:"ok"`
	Participant string `json:"participant,omitempty"`
	Reason      string `json:"reason,omitempty"`
	Detail      string `json:"detail,omitempty"`
}

func (h *Hub) seats() ([]seat, error) {
	var seats []seat
	err := json.Unmarshal(h.Participants(), &seats)
	return seats, err
}

func (h *Hub) putParticipantNotes() error {
	body, err := json.Marshal(h.participantNotes)
	if err != nil {
		return err
	}
	return h.store.PutParticipantNotes(user, body)
}

// AIJoin は AI の参加の頼みを受ける。同じ link の参加者が既にあれば、郵便は送り直さない
func (h *Hub) AIJoin(req JoinRequest) (Joined, error) {
	ids, err := h.engine.JoinActions()
	if err != nil {
		return Joined{}, err
	}
	if ids == nil {
		return Joined{Reason: "no-join", Detail: "no action is set up for joining"}, nil
	}
	h.joinMu.Lock()
	defer h.joinMu.Unlock()
	seats, err := h.seats()
	if err != nil {
		return Joined{}, err
	}
	sitting := func(s seat) bool { return s.State == "requested" || s.State == "joined" }
	for _, s := range seats {
		// 参加の id が付いていれば、その参加者が参加（要求）中なら弾く。付いていなければ、同じ AI・環境・セッション名の参加者で弾く
		if req.Participant != "" && s.ID == req.Participant && sitting(s) {
			return alreadyJoined(s), nil
		}
	}
	for _, s := range seats {
		if s.Link == req.Link {
			h.noteSession(s.ID, req.SessionID)
			return Joined{OK: true, Participant: s.ID}, h.settleNotes()
		}
	}
	if req.Participant == "" && req.SessionName != "" {
		for _, s := range seats {
			if sitting(s) && s.AI == req.AI && s.Env == req.Env && s.SessionName == req.SessionName {
				return alreadyJoined(s), nil
			}
		}
	}
	args := map[string]any{"ai": req.AI, "model": req.Model, "env": req.Env, "link": req.Link}
	if req.SessionName != "" {
		args["sessionName"] = req.SessionName
	}
	made, err := h.performAs(ids.Participant, args)
	if err != nil || !made.OK {
		return refused(made), err
	}
	var result struct {
		Participant string `json:"participant"`
	}
	if err := json.Unmarshal(made.Result, &result); err != nil {
		return Joined{}, err
	}
	delete(args, "link")
	args["from"] = req.AI
	args["participant"] = result.Participant
	told, err := h.performAs(ids.Notice, args)
	if err != nil || !told.OK {
		return refused(told), err
	}
	h.noteSession(result.Participant, req.SessionID)
	return Joined{OK: true, Participant: result.Participant}, h.settleNotes()
}

func alreadyJoined(s seat) Joined {
	return Joined{Reason: "already-participating", Detail: "participant " + s.ID + " is already " + s.State + " (use it as it is)"}
}

func refused(p Performed) Joined {
	return Joined{Reason: p.Reason, Detail: p.Detail}
}

// performAs は AI としてアクション action を行う
func (h *Hub) performAs(action string, args map[string]any) (Performed, error) {
	b, err := json.Marshal(args)
	if err != nil {
		return Performed{}, err
	}
	return h.Perform(Perform{Action: action, Args: b, By: "ai"})
}

// noteSession は参加者 id の帳簿にセッション id を書く（空なら何もしない）
func (h *Hub) noteSession(id, sessionID string) {
	if sessionID == "" {
		return
	}
	h.mu.Lock()
	defer h.mu.Unlock()
	n := h.participantNotes[id]
	n.SessionID = sessionID
	h.participantNotes[id] = n
}

// settleNotes は参加者の表に無い参加者の帳簿を捨て、帳簿を置き場所に書く
func (h *Hub) settleNotes() error {
	seats, err := h.seats()
	if err != nil {
		return err
	}
	h.mu.Lock()
	defer h.mu.Unlock()
	known := map[string]bool{}
	for _, s := range seats {
		known[s.ID] = true
	}
	for id := range h.participantNotes {
		if !known[id] {
			delete(h.participantNotes, id)
		}
	}
	return h.putParticipantNotes()
}

// Called は、参加の id が付いた /api/ai の呼び出しを帳簿に残し、その参加者が参加（joined）していて、まだ伝えていなければ、
// 1 度だけ返す「参加しました」の知らせ（伝えたと印を付ける）を返す。id が空か、表に無ければ何もしない
func (h *Hub) Called(id string, now time.Time) string {
	if id == "" {
		return ""
	}
	seats, err := h.seats()
	if err != nil {
		return ""
	}
	h.mu.Lock()
	defer h.mu.Unlock()
	for _, s := range seats {
		if s.ID != id {
			continue
		}
		n := h.participantNotes[id]
		n.Called = isoTime(now)
		if s.State == "joined" && !n.Told {
			n.Told = true
			h.participantNotes[id] = n
			if err := h.putParticipantNotes(); err != nil {
				n.Told = false
				h.participantNotes[id] = n
				return ""
			}
			return "You joined matomezu. Workroom name: " + s.Workroom
		}
		h.participantNotes[id] = n
		return ""
	}
	return ""
}

// ai は /api/ai の口を包む。合言葉を確かめたあと（auth）、参加の id のヘッダを読んで帳簿を更新し、知らせがあれば返事のヘッダに付ける
func (o Options) ai(h http.HandlerFunc) http.Handler {
	return o.auth(func(w http.ResponseWriter, r *http.Request) {
		if notice := o.Hub.Called(r.Header.Get(ParticipantHeader), time.Now()); notice != "" {
			w.Header().Set(NoticeHeader, url.QueryEscape(notice))
		}
		h(w, r)
	})
}

func (o Options) aiJoin(w http.ResponseWriter, r *http.Request) {
	var req JoinRequest
	if !readJSON(w, r, &req) {
		return
	}
	req.Participant = r.Header.Get(ParticipantHeader)
	done, err := o.Hub.AIJoin(req)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, done)
}
