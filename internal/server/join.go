package server

// AI の参加: AI（MCP の join）が参加を頼む口と、参加者ごとの記録（常駐だけが持つ）。
// 参加を頼むと、参加者を作るアクションと、利用者に知らせる郵便のアクションを、この順に行う（どのアクションかは、アクションの定義が runsWhenAIJoins で名乗る）。
// 参加者・ワークルーム・郵便はアクションの結果（レコード）が持つ。ここが持つ常駐だけが持つ参加者の記録はアクションを通さない記録で、参加者の id ごとに
//   - 最後に呼ばれた時刻（参加の id の付いた /api/ai の呼び出しのたびに更新。前に窓に知らせてから callsAnnounceGap 以上たっていたときだけ、置き場所に書いて窓に知らせる）
//   - セッション id（join のときに MCP が添えるか、UserPromptSubmit のフックが結ぶ。置き場所に残す）と、それを結んだ所（join の MCP か、UserPromptSubmit のフックか）
//   - 参加を伝えたかの印（置き場所に残す。伝えたのは、参加の id の付いた呼び出しへの返事のヘッダ、または UserPromptSubmit のフック）
//   - モデル（AI のフックが知らせる〈model.go〉か、MCP が X-Matomezu-Model ヘッダで添える〈Codex など、呼び出しがモデルを運ぶ AI〉。あとに届いた方を使う。置き場所に残し、変わったら窓に知らせる）
//   - git のブランチ（MCP が呼び出しのたびに X-Matomezu-Branch ヘッダで添える。変わったら置き場所に書いて窓に知らせる）
//   - AI のプログラム（Claude Code など）のプロセス id（MCP が X-Matomezu-Host ヘッダで、フックが host で添える。置き場所に残す。
//     セッション id が変わったとき（Claude Code の /clear など）に、同じプロセス id の参加者へ新しいセッション id を結び直すのに使う。
//     join でセッション id を運んだ参加者は結び直さない。呼び出しがセッション id を運ぶ AI〈Codex〉は、会話が変わると MCP も作り直され、
//     プロセス id は、ほかの会話〈Codex の app-server では、マシンの全部の会話〉と同じになりうるため）
//
// 受け入れた参加者は、AI のフックが参加を伝えるまで準備中（セッション id を join で運ぶ AI は受け入れた時点で準備中でない）。
// 準備中と要求中の参加の id は、MCP が名乗っても、最後に呼ばれた時刻・ブランチ・AI のプログラムのプロセス id・「参加しました」の知らせ・伝えた印を残さない（join の頼みに添えたプロセス id は、起こす知らせの宛て先として別に残す）。準備中の間は生きていない
//
// 参加の id は MCP が X-Matomezu-Participant ヘッダで毎回添え、「参加しました」の知らせは X-Matomezu-Notice ヘッダで 1 度だけ返す（値は URL エンコード）。
// 参加の id を添えるときは、ブランチ（X-Matomezu-Branch。値は URL エンコードで、git が無い・リポジトリでない・ブランチに居ないなら空）も添える。
// 呼び出しがモデルを運ぶ AI なら、モデル（X-Matomezu-Model。値は URL エンコード）も添える。AI のプログラムのプロセス id（X-Matomezu-Host）は join も含めていつも添える。
//
//	POST /api/ai/join  {"ai", "model", "env", "sessionName", "link", "sessionId", "workroom"} 参加を頼む。{"ok", "participant"}、または弾いた理由 {"ok": false, "reason", "detail"}
//
// workroom は、AI が続けたい（またはその名前で始めたい）ワークルームの名前。その名前の受け入れ済みの参加者がいて、生きていれば断る（workroom-in-use）。
// そうでなければ、名前を添えた参加の要求を郵便で出す。引き継ぐか新しく始めるかは、利用者が受け入れのダイアログで選ぶ。
// 生きているとは、最後に呼ばれてから、利用者の設定の参加の有効時間以内（最後に呼ばれた時刻は置き場所に残るので、起動し直しても続く）。
// 参加の id が付いているか、同じ link の頼みは、これを見ずに、いる参加者のまま答える（参加の id の持ち主は、生きていなくても続けられる）

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"os"
	"slices"
	"strings"
	"time"

	"github.com/umaxyon/matomezu/internal/engine"
)

const (
	// ParticipantHeader は、MCP が参加の id を添えるヘッダ
	ParticipantHeader = "X-Matomezu-Participant"
	// NoticeHeader は、常駐が AI への知らせを返すヘッダ（値は URL エンコード）
	NoticeHeader = "X-Matomezu-Notice"
	// BranchHeader は、MCP が git のブランチを添えるヘッダ（値は URL エンコード。参加の id を添えるときはいつも添え、空はブランチが無い）
	BranchHeader = "X-Matomezu-Branch"
	// HostHeader は、MCP が AI のプログラムのプロセス id を添えるヘッダ
	HostHeader = "X-Matomezu-Host"
	// HostSessionHeader は、MCP が、AI のプログラムが MCP を立てたときのセッション id を添えるヘッダ（分かるときだけ。起こす知らせの宛て先。watch.go）
	HostSessionHeader = "X-Matomezu-Host-Session"
	// SessionPidHeader は、MCP が、セッションと同じだけ生きるプロセスの id を名乗るヘッダ（居なくなればセッションが終わった。名乗らない MCP の参加者は、プロセスでは見ない）
	SessionPidHeader = "X-Matomezu-Session-Pid"
	// SessionPidSpaceHeader は、セッションのプロセスを名乗った MCP が、プロセス id が通じる範囲の印を添えるヘッダ（常駐が同じ印のときだけ、居るかを確かめる）
	SessionPidSpaceHeader = "X-Matomezu-Session-Pid-Space"
	// ModelHeader は、MCP が、呼び出しが運んだモデルを添えるヘッダ（値は URL エンコード。無ければ添えない）
	ModelHeader = "X-Matomezu-Model"
)

// participantNote は参加者 1 人の、常駐だけが持つ記録
type participantNote struct {
	SessionID       string `json:"sessionId,omitempty"`       // セッション id（join のときに MCP が添えたか、UserPromptSubmit のフックが結んだ）
	BoundBy         string `json:"boundBy,omitempty"`         // セッション id を結んだ所（boundByJoin か boundByHook。空は boundByHook と同じ）
	Told            bool   `json:"told,omitempty"`            // 参加（joined）を AI に伝えた
	Called          string `json:"called,omitempty"`          // 最後に呼ばれた時点（置き場所に残す。生きているかも、この時刻で決める。書くのは窓に知らせ直すときだけ）
	Model           string `json:"model,omitempty"`           // AI のフックが知らせたか、MCP が添えたモデル（あとに届いた方）
	Branch          string `json:"branch,omitempty"`          // MCP が添えた git のブランチ
	Host            string `json:"host,omitempty"`            // AI のプログラム（Claude Code など）のプロセス id（MCP とフックが添える）
	WakeHost        string `json:"wakeHost,omitempty"`        // join の頼みに MCP が添えた AI のプログラムのプロセス id（起こす知らせの宛て先だけに使う。結び直しには使わない。watch.go）
	WakeSession     string `json:"wakeSession,omitempty"`     // join の頼みに MCP が添えた、AI のプログラムが MCP を立てたときのセッション id（起こす知らせの宛て先。watch.go）
	SessionPid      string `json:"sessionPid,omitempty"`      // セッションと同じだけ生きるプロセスだと MCP が名乗ったプロセス id（居なくなったら退室。名乗った呼び出しだけが書く）
	SessionPidSpace string `json:"sessionPidSpace,omitempty"` // そのプロセス id が通じる範囲の印（常駐の印と同じときだけ、居るかを確かめる）
}

// live は、窓に知らせる参加者の様子（モデルとブランチ。空は省く）
func (n participantNote) live() participantLive {
	return participantLive{Model: n.Model, Branch: n.Branch}
}

// participantLive は、窓に知らせる参加者 1 人の様子
type participantLive struct {
	Model  string `json:"model,omitempty"`
	Branch string `json:"branch,omitempty"`
}

// announceLive は、参加者 id の様子の全部を窓に知らせる（h.mu を持って呼ぶ）
func (h *Hub) announceLive(id string) {
	l := h.participantNotes[id].live()
	h.broadcast("participant-live", struct {
		Participant string `json:"participant"`
		participantLive
	}{id, l})
}

const (
	boundByJoin = "join" // join のときに MCP がセッション id を運んだ（MCP の呼び出しがセッション id を運ぶ AI）
	boundByHook = "hook" // UserPromptSubmit のフックが会話の記録から結んだ
)

// ready は、受け入れたあとの参加者が準備中でない（参加者として数える）か。参加を伝えたか、join で MCP がセッション id を運んだとき
func (n participantNote) ready() bool { return n.Told || n.BoundBy == boundByJoin }

// participantRecord は参加者のレコード（役 participants）のうち、常駐が読む所（core/def/subject.ts の SUBJECT_ROLE_FIELDS）。Workroom は入っているワークルームの id
type participantRecord struct {
	ID          string `json:"id"`
	State       string `json:"state"`
	AI          string `json:"ai"`
	Model       string `json:"model"`
	Env         string `json:"env"`
	SessionName string `json:"sessionName"`
	Link        string `json:"link"`
	Workroom    string `json:"workroom"`
	RequestedAt string `json:"requestedAt"`
}

// workroomRecord はワークルームのレコード（役 workrooms）のうち、常駐が読む所
type workroomRecord struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

// JoinRequest は AI の参加の頼み。Participant は呼び出しに付いていた参加の id（無ければ空）
type JoinRequest struct {
	AI              string `json:"ai"`
	Model           string `json:"model"`
	Env             string `json:"env"`
	SessionName     string `json:"sessionName"`
	Link            string `json:"link"`
	SessionID       string `json:"sessionId"`
	Workroom        string `json:"workroom"`
	Participant     string `json:"-"`
	Host            string `json:"-"` // AI のプログラムのプロセス id（MCP が X-Matomezu-Host で添える。起こす知らせの宛て先。watch.go）
	HostSession     string `json:"-"` // AI のプログラムが MCP を立てたときのセッション id（MCP が X-Matomezu-Host-Session で添える。起こす知らせの宛て先。watch.go）
	SessionPid      string `json:"-"` // セッションと同じだけ生きるプロセスの id（MCP が X-Matomezu-Session-Pid で名乗る。退室の見張りの宛て）
	SessionPidSpace string `json:"-"` // そのプロセス id が通じる範囲の印（X-Matomezu-Session-Pid-Space）
}

// Joined は参加の頼みの結果。弾いたり断られたりしたら OK は false で、Reason と Detail に理由
type Joined struct {
	OK          bool   `json:"ok"`
	Participant string `json:"participant,omitempty"`
	Reason      string `json:"reason,omitempty"`
	Detail      string `json:"detail,omitempty"`
}

// records は参加者のレコードを要求が届いた順に返す
func (h *Hub) records() ([]participantRecord, error) {
	h.mu.Lock()
	defer h.mu.Unlock()
	return h.participantsHeld()
}

// participantsHeld は records と同じ（h.mu を持って呼ぶ）
func (h *Hub) participantsHeld() ([]participantRecord, error) {
	raw := h.recordsOfRole("participants")
	records := make([]participantRecord, 0, len(raw))
	for _, body := range raw {
		var r participantRecord
		if err := json.Unmarshal(body, &r); err != nil {
			return nil, err
		}
		records = append(records, r)
	}
	slices.SortStableFunc(records, func(a, b participantRecord) int { return strings.Compare(a.RequestedAt, b.RequestedAt) })
	return records, nil
}

// workrooms はワークルームのレコードを返す
func (h *Hub) workrooms() ([]workroomRecord, error) {
	h.mu.Lock()
	defer h.mu.Unlock()
	return h.workroomsHeld()
}

// workroomsHeld は workrooms と同じ（h.mu を持って呼ぶ）
func (h *Hub) workroomsHeld() ([]workroomRecord, error) {
	raw := h.recordsOfRole("workrooms")
	rooms := make([]workroomRecord, 0, len(raw))
	for _, body := range raw {
		var r workroomRecord
		if err := json.Unmarshal(body, &r); err != nil {
			return nil, err
		}
		rooms = append(rooms, r)
	}
	return rooms, nil
}

// roomName は、ワークルームの id の名前（無ければ空）
func roomName(rooms []workroomRecord, id string) string {
	for _, r := range rooms {
		if r.ID == id {
			return r.Name
		}
	}
	return ""
}

func (h *Hub) putParticipantNotes() error {
	body, err := json.Marshal(h.participantNotes)
	if err != nil {
		return err
	}
	return h.store.PutParticipantNotes(user, body)
}

// AIJoin は AI の参加の頼みを受ける。同じ link か参加の id の参加者が既にあれば、郵便は送り直さず、その参加者のまま答える
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
	records, err := h.records()
	if err != nil {
		return Joined{}, err
	}
	sitting := func(s participantRecord) bool { return s.State == "requested" || s.State == "joined" }
	// 参加の id が付いていて、その参加者が参加（要求）中なら、その参加者のまま答える。付いていなくても、同じ link の参加者があれば同じ
	for _, s := range records {
		if (req.Participant != "" && s.ID == req.Participant && sitting(s)) || (req.Link != "" && s.Link == req.Link) {
			h.noteSession(s.ID, req.SessionID)
			h.noteJoinHost(s.ID, req)
			return Joined{OK: true, Participant: s.ID}, h.settleNotes()
		}
	}
	left := false       // 部屋を見回るあいだに、セッションの終わった参加者を退室させた
	continuing := false // 頼まれた名前の部屋に、生きていない参加者がいる（利用者が画面で引き継ぐかを選ぶ。同じセッション名でも「参加済み」にしない）
	if req.Workroom != "" {
		rooms, err := h.workrooms()
		if err != nil {
			return Joined{}, err
		}
		for _, room := range rooms {
			if room.Name != req.Workroom {
				continue
			}
			for _, s := range records {
				if s.State != "joined" || s.Workroom != room.ID {
					continue
				}
				// 居座っている参加者が名乗った、セッションと同じだけ生きるプロセスが居なくなっていれば、そのセッションは終わっている。退室させて、部屋を空ける
				if h.sessionEnded(s.ID) {
					if err := h.leaveEnded(s.ID); err != nil {
						return Joined{}, err
					}
					left = true
					continue
				}
				alive, err := h.alive(s.ID, time.Now())
				if err != nil {
					return Joined{}, err
				}
				if alive {
					return Joined{Reason: "workroom-in-use", Detail: "workroom " + req.Workroom + " already has a participant who is alive (a person or AI joined it recently); do not ask again, tell the user in the chat. A participant who keeps its participant id continues without joining again"}, nil
				}
				continuing = true
			}
		}
	}
	// 退室のアクションは参加者の表（とほかのレコード）を変えたので、読み直す（退室した参加者を「参加済み」と答えない）
	if left {
		if records, err = h.records(); err != nil {
			return Joined{}, err
		}
	}
	if !continuing && req.Participant == "" && req.SessionName != "" {
		for _, s := range records {
			if sitting(s) && s.AI == req.AI && s.Env == req.Env && s.SessionName == req.SessionName {
				return alreadyJoined(s), nil
			}
		}
	}
	args := map[string]any{"ai": req.AI, "model": req.Model, "env": req.Env, "link": req.Link}
	if req.SessionName != "" {
		args["sessionName"] = req.SessionName
	}
	if req.Workroom != "" {
		args["wantedName"] = req.Workroom
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
	// 利用者に知らせる郵便の引数（頼んだ名前は workroom）
	delete(args, "link")
	delete(args, "wantedName")
	if req.Workroom != "" {
		args["workroom"] = req.Workroom
	}
	args["from"] = req.AI
	args["participant"] = result.Participant
	// 利用者に知らせる郵便は利用者だけが行うアクション。AI の参加の頼みを受けたここ（ホスト）が、利用者として送る
	nb, err := json.Marshal(args)
	if err != nil {
		return Joined{}, err
	}
	told, err := h.Perform(performOne(ids.Notice, nb, nil))
	if err != nil || !told.OK {
		return refused(told), err
	}
	h.noteSession(result.Participant, req.SessionID)
	h.noteJoinHost(result.Participant, req)
	return Joined{OK: true, Participant: result.Participant}, h.settleNotes()
}

// alive は、受け入れ済みの参加者 id が、時点 now で生きているか（最後に呼ばれてから、利用者の設定の参加の有効時間以内）
func (h *Hub) alive(id string, now time.Time) (bool, error) {
	settings, _ := h.Data()
	h.mu.Lock()
	called := h.participantNotes[id].Called
	h.mu.Unlock()
	return h.engine.ParticipantAlive(settings, called, now)
}

func alreadyJoined(s participantRecord) Joined {
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
	p := performOne(action, b, nil)
	p.By = "ai"
	return h.Perform(p)
}

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
		if (s.State == "requested" || s.State == "joined") && n.Host == host && n.SessionID != sessionID && n.BoundBy != boundByJoin {
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

// callsAnnounceGap は、同じ参加者の最後に呼ばれた時刻を窓に知らせ直す、いちばん短い間（毎回の呼び出しで知らせが走らないように）
const callsAnnounceGap = 30 * time.Second

// ParticipantLive は参加者の id ごとの様子（モデルとブランチ。どちらも空の参加者は省く）
func (h *Hub) ParticipantLive() map[string]participantLive {
	h.mu.Lock()
	defer h.mu.Unlock()
	out := map[string]participantLive{}
	for id, n := range h.participantNotes {
		if l := n.live(); l != (participantLive{}) {
			out[id] = l
		}
	}
	return out
}

// CallerSays は、参加の id の付いた /api/ai の呼び出しに、MCP が添えたもの
type CallerSays struct {
	Branch          string // git のブランチ（空はブランチが無い）
	BranchSent      bool   // ブランチのヘッダが付いていた（付いていなければブランチを変えない）
	Host            string // AI のプログラムのプロセス id（空なら変えない）
	SessionPid      string // セッションと同じだけ生きるプロセスだと MCP が名乗ったプロセス id（空なら変えない）
	SessionPidSpace string // そのプロセス id が通じる範囲の印
	Model           string // 呼び出しが運んだモデル（空なら変えない）
}

// callerSays は、呼び出しのヘッダから MCP が添えたものを読む
func callerSays(header http.Header) CallerSays {
	says := CallerSays{Host: header.Get(HostHeader), SessionPid: header.Get(SessionPidHeader), SessionPidSpace: header.Get(SessionPidSpaceHeader)}
	if v := header.Get(ModelHeader); v != "" {
		if m, err := url.QueryUnescape(v); err == nil {
			says.Model = m
		}
	}
	if v, ok := header[BranchHeader]; ok {
		says.BranchSent = true
		if len(v) > 0 {
			if b, err := url.QueryUnescape(v[0]); err == nil {
				says.Branch = b
			}
		}
	}
	return says
}

// ParticipantCalls は参加者の id ごとの、最後に呼ばれた時刻
func (h *Hub) ParticipantCalls() map[string]string {
	h.mu.Lock()
	defer h.mu.Unlock()
	out := make(map[string]string, len(h.participantNotes))
	for id, n := range h.participantNotes {
		if n.Called != "" {
			out[id] = n.Called
		}
	}
	return out
}

// Called は、参加の id が付いた /api/ai の呼び出しを常駐だけが持つ参加者の記録に残し、その参加者が参加（joined）していて、まだ伝えていなければ、
// 1 度だけ返す「参加しました」の知らせ（伝えたと印を付ける）を返す。参加が済んでいない（要求中か準備中）id は何も残さず、知らせも返さない。
// 表に無い id（断られたか、外された）には、1 度だけ「参加が断られた」知らせを返す。
// id が空なら何もしない。最後に呼ばれた時刻は、前に知らせてから callsAnnounceGap 以上たっていたときだけ窓に知らせる。
// says のブランチ・AI のプログラムのプロセス id・モデルも、参加が済んだ参加者にだけ残す。ブランチかモデルが変わったら、すぐに置き場所に書いて窓に知らせる
func (h *Hub) Called(id string, says CallerSays, now time.Time) string {
	if id == "" {
		return ""
	}
	records, err := h.records()
	if err != nil {
		return ""
	}
	rooms, err := h.workrooms()
	if err != nil {
		return ""
	}
	h.mu.Lock()
	defer h.mu.Unlock()
	for _, s := range records {
		if s.ID != id {
			continue
		}
		n := h.participantNotes[id]
		if s.State != "joined" || !n.ready() {
			return ""
		}
		before, _ := time.Parse(time.RFC3339Nano, n.Called)
		n.Called = isoTime(now)
		moved := says.BranchSent && n.Branch != says.Branch // ブランチかモデルが変わった
		if moved {
			n.Branch = says.Branch
		}
		if says.Model != "" && n.Model != says.Model {
			n.Model = says.Model
			moved = true
		}
		if says.Host != "" {
			n.Host = says.Host
		}
		if says.SessionPid != "" {
			n.SessionPid, n.SessionPidSpace = says.SessionPid, says.SessionPidSpace
		}
		h.participantNotes[id] = n
		announceCall := now.Sub(before) >= callsAnnounceGap
		if announceCall {
			h.broadcast("participant-calls", map[string]any{"participant": id, "at": n.Called})
		}
		if moved {
			h.announceLive(id)
		}
		if announceCall || moved {
			if err := h.putParticipantNotes(); err != nil {
				fmt.Fprintln(os.Stderr, "could not save the last call of participant", id, ":", err)
			}
		}
		// 行列の AI 間メッセージも、この返事で渡す（watch.go。通り道で先に渡った物は行列に無い）
		notices := h.takeMessages(id)
		if !n.Told {
			n.Told = true
			h.participantNotes[id] = n
			if err := h.putParticipantNotes(); err != nil {
				n.Told = false
				h.participantNotes[id] = n
				return strings.Join(notices, "\n")
			}
			notices = append([]string{joinedText(roomName(rooms, s.Workroom))}, notices...)
		}
		h.participantNotes[id] = n
		return strings.Join(notices, "\n")
	}
	if h.goneTold[id] {
		return ""
	}
	if h.goneTold == nil {
		h.goneTold = map[string]bool{}
	}
	h.goneTold[id] = true
	return "The user declined your request to join matomezu (or removed you). Tell the user, and do not ask again unless the user asks."
}

// ai は /api/ai の口を包む。合言葉を確かめたあと（auth）、参加の id・ブランチ・AI のプログラムのプロセス id のヘッダを読んで常駐だけが持つ参加者の記録を更新し、知らせがあれば返事のヘッダに付ける
func (o Options) ai(h http.HandlerFunc) http.Handler {
	return o.auth(func(w http.ResponseWriter, r *http.Request) {
		if notice := o.Hub.Called(r.Header.Get(ParticipantHeader), callerSays(r.Header), time.Now()); notice != "" {
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
	req.Host = r.Header.Get(HostHeader)
	req.HostSession = r.Header.Get(HostSessionHeader)
	req.SessionPid = r.Header.Get(SessionPidHeader)
	req.SessionPidSpace = r.Header.Get(SessionPidSpaceHeader)
	done, err := o.Hub.AIJoin(req)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, done)
}

// WorkroomOf は、参加の id が指す参加者が参加が確定している（受け入れ済みで準備中でない）なら、入っているワークルームの id（参加の id が無い・要求中・準備中・表に無いなら空）
func (h *Hub) WorkroomOf(id string) string {
	if id == "" {
		return ""
	}
	records, err := h.records()
	if err != nil {
		return ""
	}
	h.mu.Lock()
	defer h.mu.Unlock()
	for _, s := range records {
		if s.ID == id && s.State == "joined" && s.Workroom != "" && h.participantNotes[id].ready() {
			return s.Workroom
		}
	}
	return ""
}

// sessionEnded は、参加者 id が、セッションと同じだけ生きるプロセスを名乗っていて、そのプロセスが終わっているか（ProcessSpaceEnded。名乗っていない・確かめられないなら false で、退室させない側に倒す）
func (h *Hub) sessionEnded(id string) bool {
	h.mu.Lock()
	n := h.participantNotes[id]
	h.mu.Unlock()
	return n.SessionPid != "" && ProcessSpaceEnded(n.SessionPidSpace, ProcessSpace(), n.SessionPid, ProcessAlive)
}

// leaveEnded は、セッションが終わった参加者 id を、利用者として退室させる（ワークルームは空室で残る。アクションは定義が役 runsWhenAIEnds で名乗る）。
// 起こす知らせの行列は、宛先が参加者でなくなったので捨てられる（watch.go の stale）
func (h *Hub) leaveEnded(id string) error {
	ids, err := h.engine.EndActions()
	if err != nil {
		return err
	}
	if ids == nil {
		return nil
	}
	fmt.Fprintln(os.Stderr, "participant", id, "left: its session ended")
	done, err := h.Perform(performOne(ids.Leave, json.RawMessage("{}"), &engine.On{Record: id}))
	if err != nil {
		return err
	}
	if !done.OK {
		return fmt.Errorf("participant %s could not leave: %s", id, done.Detail)
	}
	return nil
}
