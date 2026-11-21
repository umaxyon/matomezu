package server

// AI の参加: AI（MCP の join）が参加を頼む口と、参加者ごとの記録（常駐だけが持つ）。
// 参加を頼むと、参加者を作るアクションを行う（どのアクションかは、アクションの定義が runsWhenAIJoins で名乗る）。利用者は、要求中の参加者を画面のしおりで見る。
// 同じ AI（参加の id・link・ai と env と sessionName が同じ）の要求が答えを待っている間は、頼み直しを断る（already-requested）。ただし、その要求のセッションが終わっていれば、
// 知らせずに要求を消して（セッションが終わったときに行うアクション。runsWhenAIEnds）、新しい要求を受ける。
// 参加者・ワークルームはアクションの結果（レコード）が持つ。ここが持つ常駐だけが持つ参加者の記録はアクションを通さない記録で、参加者の id ごとに
//   - 最後に呼ばれた時刻（参加者が決まった /api/ai の呼び出しのたびに更新。前に窓に知らせてから callsAnnounceGap 以上たっていたときだけ、置き場所に書いて窓に知らせる）
//   - セッション id（join のときに MCP が添えるか、UserPromptSubmit のフックが結ぶ。置き場所に残す）と、それを結んだ所（join の MCP か、UserPromptSubmit のフックか）
//   - 参加を伝えたかの印（置き場所に残す。伝えたのは、参加者が決まった呼び出しへの返事のヘッダ、または UserPromptSubmit のフック）
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
// 呼び出しの参加者は、参加の id か、無ければ AI のプログラムが MCP を立てたときのセッション id（X-Matomezu-Host-Session）に結ばれた参加者で決まる
// （MCP が起動し直されて参加の id を失ったとき。ai の包みが決め、participantOf で読む）。
// 参加の id かセッション id を添えるときは、ブランチ（X-Matomezu-Branch。値は URL エンコードで、git が無い・リポジトリでない・ブランチに居ないなら空）も添える。
// 呼び出しがモデルを運ぶ AI なら、モデル（X-Matomezu-Model。値は URL エンコード）も添える。AI のプログラムのプロセス id（X-Matomezu-Host）は join も含めていつも添える。
//
//	POST /api/ai/join  {"ai", "model", "env", "sessionName", "link", "sessionId", "workroom", "as", "adeWorkspace"} 参加を頼む。{"ok", "participant"}、または弾いた理由 {"ok": false, "reason", "detail"}
//
// workroom は、AI が続けたい（またはその名前で始めたい）ワークルームの名前。その名前の受け入れ済みの参加者がいて、生きていれば断る（workroom-in-use）。
// そうでなければ、名前を添えた参加の要求を出す。引き継ぐか新しく始めるかは、利用者が受け入れのダイアログで選ぶ。
// 生きているとは、最後に呼ばれてから、利用者の設定の参加の有効時間以内（最後に呼ばれた時刻は置き場所に残るので、起動し直しても続く）。
// 呼び出しの参加者が決まっているか、同じ link の頼みは、これを見ずに、受け入れ済みの参加者のまま答える（参加の id の持ち主は、生きていなくても続けられる）

import (
	"encoding/json"
	"net/http"
	"slices"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/umaxyon/matomezu/internal/aiwire"
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
	JoinedAt    string `json:"joinedAt"` // 受け入れた時点（受け入れ済みだけ）
}

// 参加者の state の値（core/def/subject.ts の PARTICIPANT_STATES）
const (
	stateRequested = "requested" // 要求中
	stateJoined    = "joined"    // 受け入れ済みで、ワークルームに入っている
	stateVisitor   = "visitor"   // 受け入れ済みで、ワークルームを持たない（ビジター。読むだけ）
)

// accepted は、受け入れ済み（ワークルームに入っているか、ビジター）か
func (s participantRecord) accepted() bool { return s.State == stateJoined || s.State == stateVisitor }

// sitting は、参加（要求）中か: 要求中か、受け入れ済み
func (s participantRecord) sitting() bool { return s.State == stateRequested || s.accepted() }

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
	As              string `json:"as"`           // visitor なら、ビジターとしての参加（ワークルームと一緒には頼めない）
	AdeWorkspace    string `json:"adeWorkspace"` // AI が動いている ADE のワークスペースの名前（MCP が clients/ade の部品に訊いて添える。分からなければ空）
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

// AIJoin は AI の参加の頼みを受ける。同じ link か参加の id の受け入れ済みの参加者が既にあれば、その参加者のまま答える。要求中なら断る（セッションが終わっていれば消して受ける）
func (h *Hub) AIJoin(req JoinRequest) (Joined, error) {
	workspace := strings.TrimSpace(req.AdeWorkspace)
	if utf8.RuneCountInString(workspace) > 120 {
		return Joined{Reason: "bad-args", Detail: "adeWorkspace must have at most 120 characters"}, nil
	}
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
	left := false // セッションの終わった参加者を退室させた（要求中の参加者を消したときも）
	// 呼び出しの参加者が決まっていて、その参加者が受け入れ済みなら、その参加者のまま答える。決まっていなくても、同じ link の参加者があれば同じ。要求中なら断る
	for _, s := range records {
		if (req.Participant != "" && s.ID == req.Participant && s.sitting()) || (req.Link != "" && s.Link == req.Link) {
			if s.State == stateRequested {
				waiting, err := h.dropIfEnded(s)
				if err != nil || waiting {
					return alreadyRequested(s), err
				}
				left = true
				continue
			}
			h.noteSession(s.ID, req.SessionID)
			h.noteJoinHost(s.ID, req)
			return Joined{OK: true, Participant: s.ID}, h.settleNotes()
		}
	}
	continuing := false // 頼まれた名前の部屋に、生きていない参加者がいる（利用者が画面で引き継ぐかを選ぶ。同じセッション名でも「参加済み」にしない）
	roomID := ""        // 頼まれた名前の部屋の id（無ければ空）
	occupant := ""      // 頼まれた名前の部屋にいる、生きていない参加者の id
	// ビジターとしての頼み（As）は、ワークルームを持たないので部屋を見回らない（ワークルームと一緒に頼めば、要求のアクションが断る）
	if req.Workroom != "" && req.As == "" {
		rooms, err := h.workrooms()
		if err != nil {
			return Joined{}, err
		}
		for _, room := range rooms {
			if room.Name != req.Workroom {
				continue
			}
			roomID = room.ID
			for _, s := range records {
				if s.State != stateJoined || s.Workroom != room.ID {
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
				occupant = s.ID
			}
		}
	}
	// 退室のアクションは参加者の表（とほかのレコード）を変えたので、読み直す（退室した参加者を「参加済み」と答えない）
	if left {
		if records, err = h.records(); err != nil {
			return Joined{}, err
		}
	}
	// 開発用: 前もって承認した合言葉で、その部屋の続きを頼んだら、画面を通さずに受け入れる（rejoin_pass.go）
	if done, ok, err := h.joinByPass(req, ids, roomID, occupant); ok || err != nil {
		return done, err
	}
	if !continuing && req.Participant == "" && req.SessionName != "" {
		for _, s := range records {
			if !s.sitting() || s.AI != req.AI || s.Env != req.Env || s.SessionName != req.SessionName {
				continue
			}
			if s.State != stateRequested {
				return alreadyJoined(s), nil
			}
			if waiting, err := h.dropIfEnded(s); err != nil || waiting {
				return alreadyRequested(s), err
			}
		}
	}
	args := map[string]any{"ai": req.AI, "model": req.Model, "env": req.Env, "link": req.Link}
	if req.SessionName != "" {
		args["sessionName"] = req.SessionName
	}
	if workspace != "" {
		args["adeWorkspace"] = workspace
	}
	if req.Workroom != "" {
		args["wantedName"] = req.Workroom
	}
	if req.As != "" {
		args["as"] = req.As
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

// dropIfEnded は、要求中の参加者 s のセッションが終わっていれば、知らせずに消す（セッションが終わったときに行うアクションで）。waiting は、消さずに答えを待っているか
func (h *Hub) dropIfEnded(s participantRecord) (waiting bool, err error) {
	if !h.sessionEnded(s.ID) {
		return true, nil
	}
	return false, h.leaveEnded(s.ID)
}

func alreadyRequested(s participantRecord) Joined {
	return Joined{Reason: "already-requested", Detail: "your request to join (participant " + s.ID + ") is waiting for the user's answer on the matomezu screen; do not ask again, ask the user to answer it"}
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

func (o Options) aiJoin(w http.ResponseWriter, r *http.Request) {
	var req JoinRequest
	if !readJSON(w, r, &req) {
		return
	}
	req.Participant = participantOf(r)
	req.Host = r.Header.Get(aiwire.HostHeader)
	req.HostSession = r.Header.Get(aiwire.HostSessionHeader)
	req.SessionPid = r.Header.Get(aiwire.SessionPidHeader)
	req.SessionPidSpace = r.Header.Get(aiwire.SessionPidSpaceHeader)
	done, err := o.Hub.AIJoin(req)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, done)
}

// showRefusal は、参加者 id の AI が show を頼んだときの断りの理由と文（参加が確定してワークルームに入っている AI なら、どちらも空）
func (h *Hub) showRefusal(id string) (reason, detail string) {
	h.mu.Lock()
	actor := h.actorOfParticipantHeld(id)
	h.mu.Unlock()
	switch {
	case actor.As == stateVisitor:
		return "visitor", "a visitor only reads: it cannot show books on the user's screen"
	case actor.Workroom == "":
		return "not-joined", "only an AI whose request to join was accepted shows books on the user's screen (call join first)"
	}
	return "", ""
}
