//go:build !embed

// 開発用の再参加の承認: 起動し直したサブの AI の join を、画面を通さずに受け入れる（scripts/restart-subs.ts が使う）。
// リリースの実行ファイル（ビルドタグ embed）には入らない（rejoin_pass_off.go の空の物）。

package server

import (
	"encoding/json"
	"net/http"
	"strings"
	"sync"

	"github.com/umaxyon/matomezu/internal/engine"
)

// acceptAction は、要求中の参加者をワークルームに受け入れるアクション（開発用だけなので、役を通さずに名指す）
const acceptAction = "@matomezu/base:participant-accept"

// rejoinPasses は、ワークルームの名前 → 前もって承認した合言葉（join の link）。1 回使えば消える。常駐のメモリにだけ持つ
type rejoinPasses struct {
	mu    sync.Mutex
	links map[string]string
}

// routesForDev は、開発用の HTTP のパスを足す。POST /api/dev/rejoin-pass {"workroom", "link"}: そのワークルームの続きを、その合言葉で頼んだ join を前もって承認する（同じワークルームの前の承認は置き換える）
func routesForDev(mux *http.ServeMux, o Options) {
	mux.Handle("POST /api/dev/rejoin-pass", o.auth(func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			Workroom string `json:"workroom"`
			Link     string `json:"link"`
		}
		if !readJSON(w, r, &req) {
			return
		}
		room, link := strings.TrimSpace(req.Workroom), strings.TrimSpace(req.Link)
		if room == "" || link == "" {
			http.Error(w, "workroom and link are required", http.StatusBadRequest)
			return
		}
		o.Hub.rejoin.mu.Lock()
		if o.Hub.rejoin.links == nil {
			o.Hub.rejoin.links = map[string]string{}
		}
		o.Hub.rejoin.links[room] = link
		o.Hub.rejoin.mu.Unlock()
		writeJSON(w, map[string]any{"ok": true})
	}))
}

// takePass は、ワークルーム room の承認が合言葉 link なら、それを消して true（1 回だけ使える）
func (p *rejoinPasses) takePass(room, link string) bool {
	p.mu.Lock()
	defer p.mu.Unlock()
	if link == "" || p.links[room] != link {
		return false
	}
	delete(p.links, room)
	return true
}

// joinByPass は、前もって承認した合言葉で、今あるワークルーム roomID の続きを頼んだ join を、参加者を作るのと受け入れるのを 1 つのバルクで、利用者として行う。
// occupant はワークルームにいる生きていない参加者（いれば受け入れで外す）。承認が無い・合わない・ビジターの頼み・ワークルームが無いときは ok が false（参加の要求として、利用者が画面で受け入れる）。
// h.joinMu を持って呼ぶ
func (h *Hub) joinByPass(req JoinRequest, ids *engine.JoinActions, roomID, occupant string) (Joined, bool, error) {
	if req.As != "" || roomID == "" || !h.rejoin.takePass(req.Workroom, req.Link) {
		return Joined{}, false, nil
	}
	asked := req.askedArgs()
	into := map[string]any{"workroom": roomID}
	if occupant != "" {
		into["occupant"] = occupant
	}
	askedJSON, err := json.Marshal(asked)
	if err != nil {
		return Joined{}, true, err
	}
	intoJSON, err := json.Marshal(into)
	if err != nil {
		return Joined{}, true, err
	}
	// 参加者の id は先に決めて、要求のアクションに振らせる（受け入れのアクションの宛先にする）
	id := newEnvelopeID()
	// 準備中にならないよう、受け入れる前にセッション id と起こす知らせの宛て先を結ぶ
	h.noteSession(id, req.SessionID)
	h.noteJoinHost(id, req)
	done, err := h.Perform(Perform{Actions: []engine.BulkAction{
		{Action: ids.Participant, Args: askedJSON, IDs: []string{id}},
		{Action: acceptAction, Args: intoJSON, On: &engine.On{Record: id}},
	}})
	if err != nil || !done.OK {
		return refused(done), true, err
	}
	return Joined{OK: true, Participant: id}, true, h.settleNotes()
}
