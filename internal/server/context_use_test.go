package server

import (
	"net/http"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/umaxyon/matomezu/internal/aiwire"
)

// フックが知らせたコンテキストの量は、そのセッション id が結ばれた参加者の様子に載せ、変わったときだけ窓に知らせる。読めないと知らされたら様子から外す。
// 置き場所には書かない
func TestHeardContextUseReachesTheSessionsParticipant(t *testing.T) {
	store := joinStore(t)
	s, hub := joinWorld(t, store)
	p1 := joinedID(t, s.URL, joinBody("L1", ""))
	live := watchEvents(hub, "participant-live")
	post := func(body string) string {
		got, _ := call(t, "POST", s.URL+"/api/ai/context-use", body, nil)
		return got
	}
	if got := post(`{"sessionId":"S1","contextUse":{"used":120000,"aiScale":300000}}`); got != "{}" {
		t.Fatalf("context-use = %q", got)
	}
	if got := live(); len(got) != 1 || got[0] != `{"participant":"`+p1+`","contextUse":{"used":120000,"aiScale":300000}}` {
		t.Fatalf("participant-live = %v", got)
	}
	if got := hub.ParticipantLive()[p1].ContextUse; got != (contextUse{Used: 120000, AIScale: 300000}) {
		t.Fatalf("live = %+v", got)
	}
	if saved, _ := store.ParticipantNotes(user); strings.Contains(string(saved), "120000") {
		t.Fatalf("saved notes = %s", saved)
	}
	post(`{"sessionId":"S1","contextUse":{"used":120000,"aiScale":300000}}`)
	if got := live(); len(got) != 0 {
		t.Fatalf("announced the same value: %v", got)
	}
	post(`{"sessionId":"S1","contextUse":"unknown"}`)
	if got := live(); len(got) != 1 || strings.Contains(got[0], "contextUse") {
		t.Fatalf("unknown = %v", got)
	}
	if got := hub.ParticipantLive()[p1].ContextUse; got != noContextUse {
		t.Fatalf("live after unknown = %+v", got)
	}
	for _, bad := range []string{`{"sessionId":"S1"}`, `{"sessionId":"S1","contextUse":"x"}`, `{"sessionId":"S1","contextUse":[1]}`} {
		req, _ := http.NewRequest("POST", s.URL+"/api/ai/context-use", strings.NewReader(bad))
		req.Header.Set("Authorization", "Bearer secret")
		res, err := http.DefaultClient.Do(req)
		if err != nil || res.StatusCode != http.StatusBadRequest {
			t.Fatalf("%s: %v %v", bad, res, err)
		}
		res.Body.Close()
	}

	// 結ばれる前に知らされた量は、UserPromptSubmit のフックが結んだときに窓に知らせる
	post(`{"sessionId":"S3","contextUse":{"used":5000,"aiScale":1000000}}`)
	p3 := joinedID(t, s.URL, `{"ai":"claude","model":"opus","env":"linux","link":"6f1c2a3e-1111-4222-8333-444455556666"}`)
	live()
	call(t, "POST", s.URL+"/api/ai/talked", `{"sessionId":"S3","host":"300","candidates":["6f1c2a3e-1111-4222-8333-444455556666"]}`, nil)
	if got := strings.Join(live(), "\n"); !strings.Contains(got, `"participant":"`+p3+`"`) || !strings.Contains(got, `"contextUse":{"used":5000,"aiScale":1000000}`) {
		t.Fatalf("bound = %v", got)
	}
}

// セッション id が変わったとき（/clear）、host が同じ参加者を新しいセッションに結び直し、新しいセッションの量（無ければ無いこと）を窓に知らせる
func TestContextUseRebindsByHost(t *testing.T) {
	s, hub := joinWorld(t, joinStore(t))
	id := joinedID(t, s.URL, `{"ai":"claude","model":"opus","env":"linux","link":"L2"}`)
	acceptRoom(t, s.URL, id, "すずめ")
	call(t, "POST", s.URL+"/api/ai/talked", `{"sessionId":"C1","host":"100","candidates":["L2"]}`, nil)
	call(t, "GET", s.URL+"/api/ai/books", "", map[string]string{aiwire.ParticipantHeader: id, aiwire.HostHeader: "100"})
	call(t, "POST", s.URL+"/api/ai/context-use", `{"sessionId":"C1","host":"100","contextUse":{"used":250000,"aiScale":300000}}`, nil)
	live := watchEvents(hub, "participant-live")
	call(t, "POST", s.URL+"/api/ai/context-use", `{"sessionId":"C2","host":"100","contextUse":{"used":20000,"aiScale":300000}}`, nil)
	if n := noteOf(hub, id); n.SessionID != "C2" {
		t.Fatalf("not rebound: %+v", n)
	}
	got := live()
	if len(got) == 0 || !strings.Contains(got[len(got)-1], `"contextUse":{"used":20000,"aiScale":300000}`) {
		t.Fatalf("participant-live = %v", got)
	}
	call(t, "POST", s.URL+"/api/ai/model", `{"sessionId":"C3","host":"100"}`, nil)
	if got := live(); len(got) == 0 || strings.Contains(got[len(got)-1], "contextUse") {
		t.Fatalf("a new session without a value = %v", got)
	}
}

// 参加者に結ばれていないセッションの量は、古くなったものと、上限を超えた分（知らせた時点の古いもの）を捨てる。結ばれたセッションの量は捨てない
func TestHeardContextsAreDroppedWhenOldOrTooMany(t *testing.T) {
	s, hub := joinWorld(t, joinStore(t))
	t0 := time.Date(2026, 11, 12, 0, 0, 0, 0, time.UTC)
	use := contextUse{Used: 1, AIScale: 2}
	bound := joinedID(t, s.URL, joinBody("L1", ""))
	_ = hub.HeardContextUse("S1", "", use, t0.Add(-time.Hour))
	_ = hub.HeardContextUse("old", "", use, t0)
	_ = hub.HeardContextUse("S0", "", use, t0.Add(heardContextKeep+time.Minute))
	if _, ok := hub.heardContexts["old"]; ok {
		t.Fatal("an old one was kept")
	}
	for i := 1; i <= heardContextsMax; i++ {
		_ = hub.HeardContextUse("N"+strconv.Itoa(i), "", use, t0.Add(heardContextKeep+time.Duration(i+1)*time.Minute))
	}
	if _, ok := hub.heardContexts["S0"]; ok || len(hub.heardContexts) != heardContextsMax+1 {
		t.Fatalf("kept %d, S0 kept: %v", len(hub.heardContexts), ok)
	}
	if got := hub.ParticipantLive()[bound].ContextUse; got != use {
		t.Fatalf("the bound session's use was dropped: %+v", got)
	}
}
