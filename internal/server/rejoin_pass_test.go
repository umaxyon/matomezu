//go:build !embed

package server

import (
	"encoding/json"
	"strings"
	"testing"

	"github.com/umaxyon/matomezu/internal/aiwire"
)

// passFor は、開発用の口でワークルーム room の続きを合言葉 link で前もって承認する
func passFor(t *testing.T, url, room, link string) {
	t.Helper()
	if got, _ := call(t, "POST", url+"/api/dev/rejoin-pass", `{"workroom":"`+room+`","link":"`+link+`"}`, nil); !strings.Contains(got, `"ok":true`) {
		t.Fatalf("rejoin-pass = %s", got)
	}
}

// 前もって承認した合言葉でワークルームの続きを頼むと、画面を通さずに受け入れ、前の参加者を外す。承認は 1 回で消える
func TestJoinWithARejoinPassIsAcceptedWithoutTheScreen(t *testing.T) {
	s, hub := joinWorld(t, joinStore(t))
	got, _ := call(t, "POST", s.URL+"/api/ai/join", joinWith("L1", "work", `,"sessionId":"S1"`), nil)
	var first Joined
	_ = json.Unmarshal([]byte(got), &first)
	acceptRoom(t, s.URL, first.Participant, "ひよこ")
	before := table(t, s.URL)

	passFor(t, s.URL, "ひよこ", "L2")
	asked, _ := call(t, "POST", s.URL+"/api/ai/join", joinWith("L2", "work", `,"workroom":"ひよこ","sessionId":"S2"`), nil)
	var second Joined
	if json.Unmarshal([]byte(asked), &second) != nil || !second.OK || second.Participant == first.Participant {
		t.Fatalf("join = %s", asked)
	}
	rows := table(t, s.URL)
	if len(rows) != 1 || rows[0].ID != second.Participant || rows[0].State != "joined" || rows[0].Workroom != before[0].Workroom {
		t.Fatalf("participants = %+v", rows)
	}
	// 受け入れたので、次の呼び出しで「参加しました」が伝わる
	if _, h := call(t, "GET", s.URL+"/api/ai/books", "", map[string]string{aiwire.ParticipantHeader: second.Participant}); h.Get(aiwire.NoticeHeader) == "" {
		t.Fatal("the rejoined AI was not welcomed")
	}
	if len(hub.rejoin.links) != 0 {
		t.Fatalf("the pass is left: %v", hub.rejoin.links)
	}
}

// 合言葉が違う・ワークルームの参加者が生きている・承認が無いワークルームの名前は、参加の要求（画面で受け入れる）になるか、断る
func TestJoinWithoutAMatchingRejoinPassGoesThroughTheScreen(t *testing.T) {
	s, _ := joinWorld(t, joinStore(t))
	got, _ := call(t, "POST", s.URL+"/api/ai/join", joinWith("L1", "", `,"sessionId":"S1"`), nil)
	var first Joined
	_ = json.Unmarshal([]byte(got), &first)
	acceptRoom(t, s.URL, first.Participant, "ひよこ")

	passFor(t, s.URL, "ひよこ", "L9")
	call(t, "GET", s.URL+"/api/ai/books", "", map[string]string{aiwire.ParticipantHeader: first.Participant}) // 呼ばれた: 生きている
	if refused, _ := call(t, "POST", s.URL+"/api/ai/join", joinWith("L9", "", `,"workroom":"ひよこ"`), nil); !strings.Contains(refused, `"reason":"workroom-in-use"`) {
		t.Fatalf("join while alive = %s", refused)
	}
	other, _ := call(t, "POST", s.URL+"/api/ai/join", joinWith("L2", "", `,"workroom":"ぴよ"`), nil)
	if !strings.Contains(other, `"ok":true`) {
		t.Fatalf("join = %s", other)
	}
	if rows := table(t, s.URL); len(rows) != 2 || rows[1].State != "requested" {
		t.Fatalf("participants = %+v", rows)
	}
}

// 開発用の口は、常駐の合言葉が無ければ断る
func TestRejoinPassNeedsTheToken(t *testing.T) {
	s, _ := joinWorld(t, joinStore(t))
	got, _ := call(t, "POST", s.URL+"/api/dev/rejoin-pass", `{"workroom":"ひよこ","link":"L1"}`, map[string]string{"Authorization": "Bearer wrong"})
	if !strings.Contains(got, "unauthorized") {
		t.Fatalf("rejoin-pass = %s", got)
	}
}
