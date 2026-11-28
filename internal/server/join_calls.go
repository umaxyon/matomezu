package server

// 呼び出しの参加者を決める: /api/ai の呼び出しがどの参加者のものか（参加者の id か、MCP が運ぶセッション id で引く）と、最後に呼ばれた時刻・モデル・ブランチの知らせ

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"

	"github.com/umaxyon/matomezu/internal/aiwire"
	"github.com/umaxyon/matomezu/internal/engine"
)

// callsAnnounceGap は、同じ参加者の最後に呼ばれた時刻を窓に知らせ直す、いちばん短い間（毎回の呼び出しで知らせが走らないように）
const callsAnnounceGap = 30 * time.Second

// ParticipantLive は参加者の id ごとの様子（モデルとブランチと、起こす知らせを渡せる通り道がつながっているか。どれも無い参加者は省く）
func (h *Hub) ParticipantLive() map[string]participantLive {
	h.mu.Lock()
	defer h.mu.Unlock()
	out := map[string]participantLive{}
	for id := range h.participantNotes {
		if l := h.liveLocked(id); l != (participantLive{}) {
			out[id] = l
		}
	}
	return out
}

// CallerSays は、参加者が決まった /api/ai の呼び出しに、MCP が添えたもの
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
	says := CallerSays{Host: header.Get(aiwire.HostHeader), SessionPid: header.Get(aiwire.SessionPidHeader), SessionPidSpace: header.Get(aiwire.SessionPidSpaceHeader)}
	if v := header.Get(aiwire.ModelHeader); v != "" {
		if m, err := url.QueryUnescape(v); err == nil {
			says.Model = m
		}
	}
	if v, ok := header[aiwire.BranchHeader]; ok {
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

// Called は、参加者が決まった /api/ai の呼び出しを常駐だけが持つ参加者の記録に残し、その参加者が参加（joined）していて、まだ伝えていなければ、
// 1 度だけ返す「参加しました」の知らせ（伝えたと印を付ける）を返す。参加が済んでいない（要求中か準備中）id は何も残さず、知らせも返さない。
// 表に無い id（外された・断られた・キャンセルされた）には、その記録があれば 1 度だけ、訳を言う知らせを返す（departure.go）。
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
		if !s.accepted() || !n.ready() {
			return ""
		}
		before, _ := time.Parse(time.RFC3339Nano, n.Called)
		n.Called = calledAt(n.Called, now)
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
			h.kickRooms() // 有効時間を過ぎていた参加者が、また生きている（有効時間は callsAnnounceGap より長い）
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
		notices := h.takeCallLines(id)
		if !n.Told {
			n.Told = true
			h.participantNotes[id] = n
			if err := h.putParticipantNotes(); err != nil {
				n.Told = false
				h.participantNotes[id] = n
				return strings.Join(notices, "\n")
			}
			notices = append([]string{h.joinedTextHeld(s, rooms)}, notices...)
		}
		h.participantNotes[id] = n
		return strings.Join(notices, "\n")
	}
	// 表に無い参加者: 外れた・断られた・キャンセルされた記録があれば、1 度だけ伝える（departure.go）
	return h.tellDepartureHeld(h.departureOfParticipantHeld(id))
}

// declinedText は、利用者が参加の要求を断ったと、AI の次の呼び出しの返事で伝える文
const declinedText = "The user declined your request to join matomezu. Tell the user, and do not ask again unless the user asks."

// ai は /api/ai の口を包む。合言葉を確かめたあと（auth）、呼び出しの参加者を決め（participantOf で読む）、ブランチ・AI のプログラムのプロセス id のヘッダを読んで
// 常駐だけが持つ参加者の記録を更新し、知らせがあれば返事のヘッダに付ける。
// 参加者は、参加の id のヘッダか、無ければ AI のプログラムが MCP を立てたときのセッション id のヘッダに結ばれた参加者（SessionParticipant。
// MCP が起動し直されて、join で受けた参加の id を失ったとき）
func (o Options) ai(h http.HandlerFunc) http.Handler {
	return o.auth(func(w http.ResponseWriter, r *http.Request) {
		id := r.Header.Get(aiwire.ParticipantHeader)
		if id == "" {
			id = o.Hub.SessionParticipant(r.Header.Get(aiwire.HostSessionHeader), r.Header.Get(aiwire.HostHeader))
		}
		r = r.WithContext(context.WithValue(r.Context(), participantKey{}, id))
		notice := o.Hub.Called(id, callerSays(r.Header), time.Now())
		if id == "" {
			// 誰にも結ばれていない会話: そのセッションの参加者が外れていれば、1 度だけ伝える（MCP が起動し直して参加の id を失った会話。departure.go）
			notice = o.Hub.DepartedSession(r.Header.Get(aiwire.HostSessionHeader))
		}
		if notice != "" {
			w.Header().Set(aiwire.NoticeHeader, url.QueryEscape(notice))
		}
		if id != "" {
			w = &titledWriter{ResponseWriter: w, title: func() string { return o.Hub.ParticipantWorkTitle(id) }}
		}
		h(w, r)
	})
}

// titledWriter は、呼び出しの参加者の作業名を、答えを書き始めるとき（呼び出しで行った事のあと）に見出しに添える ResponseWriter
type titledWriter struct {
	http.ResponseWriter
	title func() string
	done  bool
}

func (t *titledWriter) put() {
	if t.done {
		return
	}
	t.done = true
	if title := t.title(); title != "" {
		t.Header().Set(aiwire.WorkTitleHeader, url.QueryEscape(title))
	}
}

func (t *titledWriter) WriteHeader(code int) {
	t.put()
	t.ResponseWriter.WriteHeader(code)
}

func (t *titledWriter) Write(b []byte) (int, error) {
	t.put()
	return t.ResponseWriter.Write(b)
}

// Unwrap は、包んだ ResponseWriter（http.ResponseController が使う）
func (t *titledWriter) Unwrap() http.ResponseWriter { return t.ResponseWriter }

// Flush は、包んだ ResponseWriter が Flusher なら流す（長く待つ口のため）
func (t *titledWriter) Flush() {
	t.put()
	if f, ok := t.ResponseWriter.(http.Flusher); ok {
		f.Flush()
	}
}

// participantKey は、ai の包みが決めた呼び出しの参加者を、request の context に置く鍵
type participantKey struct{}

// participantOf は、ai の包みが決めた呼び出しの参加の id（無ければ空）
func participantOf(r *http.Request) string {
	id, _ := r.Context().Value(participantKey{}).(string)
	return id
}

// actorOfParticipantHeld は、参加者 id の AI のアクター: 参加が確定していれば、入っているワークルームの id か、ビジターの印。
// 確定していなければ、どちらも無い（core は参加が確定していない AI として扱う）。h.mu を持って呼ぶ
func (h *Hub) actorOfParticipantHeld(id string) *engine.Actor {
	actor := &engine.Actor{Kind: "ai"}
	if id == "" || !h.participantNotes[id].ready() {
		return actor
	}
	var participant participantRecord
	entry, ok := h.recordTables[h.roles["participants"]][id]
	if !ok || json.Unmarshal(entry.body, &participant) != nil {
		return actor
	}
	switch participant.State {
	case stateJoined:
		actor.Workroom = participant.Workroom
	case stateVisitor:
		actor.As = stateVisitor
	}
	return actor
}
