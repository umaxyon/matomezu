package server

import (
	"encoding/json"
	"strconv"
	"strings"
	"testing"
	"time"
)

// watchEvents は、窓を 1 つつないで、名前 name の知らせの中身を、呼ぶたびにそれまでに届いた分だけ返す関数
func watchEvents(hub *Hub, name string) func() []string {
	hub.mu.Lock()
	c := &client{id: "w-" + name, ch: make(chan event, 64)}
	hub.clients[c.id] = c
	hub.mu.Unlock()
	return func() (got []string) {
		for {
			select {
			case e := <-c.ch:
				if e.name == name {
					got = append(got, string(e.data))
				}
			default:
				return
			}
		}
	}
}

func noteOf(hub *Hub, id string) participantNote {
	hub.mu.Lock()
	defer hub.mu.Unlock()
	return hub.participantNotes[id]
}

func joinedID(t *testing.T, url, body string) string {
	t.Helper()
	got, _ := call(t, "POST", url+"/api/ai/join", body, nil)
	var joined Joined
	if err := json.Unmarshal([]byte(got), &joined); err != nil || joined.Participant == "" {
		t.Fatalf("join = %q", got)
	}
	return joined.Participant
}

// MCP が添えたブランチとモデルは、参加が済んだ参加者にだけ残す。変わったときだけ、すぐに置き場所に書いて窓に知らせ、空のブランチは消す。
// ブランチのヘッダが無ければブランチを、モデルのヘッダが無ければモデルを変えない。モデルは、フックが知らせたモデルとあとに届いた方を使う
func TestCalledNotesTheBranchHostAndModel(t *testing.T) {
	store := joinStore(t)
	s, hub := joinWorld(t, store)
	id := joinedID(t, s.URL, joinBody("L1", ""))
	with := func(branch string) map[string]string {
		return map[string]string{ParticipantHeader: id, BranchHeader: branch, HostHeader: "100"}
	}
	call(t, "GET", s.URL+"/api/ai/books", "", with("main"))
	if n := noteOf(hub, id); n.Branch != "" || n.Host != "" {
		t.Fatalf("noted while requested: %+v", n)
	}
	acceptRoom(t, s.URL, id, "ひよこ")
	live := watchEvents(hub, "participant-live")

	call(t, "GET", s.URL+"/api/ai/books", "", with("feat%2Fx"))
	if n := noteOf(hub, id); n.Branch != "feat/x" || n.Host != "100" {
		t.Fatalf("note = %+v", n)
	}
	if got := live(); len(got) != 1 || got[0] != `{"participant":"`+id+`","branch":"feat/x"}` {
		t.Fatalf("participant-live = %v", got)
	}
	if saved, _ := store.ParticipantNotes(user); !strings.Contains(string(saved), `"branch":"feat/x"`) {
		t.Fatalf("saved notes = %s", saved)
	}
	call(t, "GET", s.URL+"/api/ai/books", "", with("feat%2Fx"))
	call(t, "GET", s.URL+"/api/ai/books", "", map[string]string{ParticipantHeader: id})
	if got := live(); len(got) != 0 || noteOf(hub, id).Branch != "feat/x" {
		t.Fatalf("announced without a change: %v, %+v", got, noteOf(hub, id))
	}
	call(t, "GET", s.URL+"/api/ai/books", "", with(""))
	if got := live(); len(got) != 1 || got[0] != `{"participant":"`+id+`"}` || noteOf(hub, id).Branch != "" {
		t.Fatalf("an empty branch: %v, %+v", got, noteOf(hub, id))
	}
	if _, ok := hub.ParticipantLive()[id]; ok {
		t.Fatalf("live without a model or branch = %v", hub.ParticipantLive())
	}

	model := func(m string) map[string]string {
		return map[string]string{ParticipantHeader: id, ModelHeader: m}
	}
	call(t, "GET", s.URL+"/api/ai/books", "", model("gpt-6%2Fluna"))
	if got := live(); len(got) != 1 || got[0] != `{"participant":"`+id+`","model":"gpt-6/luna"}` {
		t.Fatalf("participant-live by the model header = %v", got)
	}
	if saved, _ := store.ParticipantNotes(user); !strings.Contains(string(saved), `"model":"gpt-6/luna"`) {
		t.Fatalf("saved notes = %s", saved)
	}
	call(t, "GET", s.URL+"/api/ai/books", "", model("gpt-6%2Fluna"))
	call(t, "GET", s.URL+"/api/ai/books", "", map[string]string{ParticipantHeader: id})
	if got := live(); len(got) != 0 || noteOf(hub, id).Model != "gpt-6/luna" {
		t.Fatalf("announced without a change: %v, %+v", got, noteOf(hub, id))
	}
	call(t, "POST", s.URL+"/api/ai/model", `{"sessionId":"S1","model":"gpt-6-sol"}`, nil)
	call(t, "GET", s.URL+"/api/ai/books", "", model("gpt-6-astra"))
	if n := noteOf(hub, id); n.Model != "gpt-6-astra" {
		t.Fatalf("the model that came last = %+v", n)
	}
}

// フックが知らせたモデルは、そのセッション id を結んだ参加者に書く。結ばれる前なら覚えておき、join で MCP が運んだときと、UserPromptSubmit のフックが結んだときに移す
func TestHeardModelReachesTheSessionsParticipant(t *testing.T) {
	store := joinStore(t)
	s, hub := joinWorld(t, store)
	model := func(body string) {
		if got, _ := call(t, "POST", s.URL+"/api/ai/model", body, nil); got != "{}" {
			t.Fatalf("model = %q", got)
		}
	}
	// 結ばれたセッション
	p1 := joinedID(t, s.URL, joinBody("L1", ""))
	live := watchEvents(hub, "participant-live")
	model(`{"sessionId":"S1","model":"opus-5"}`)
	if n := noteOf(hub, p1); n.Model != "opus-5" {
		t.Fatalf("note = %+v", n)
	}
	if got := live(); len(got) != 1 || got[0] != `{"participant":"`+p1+`","model":"opus-5"}` {
		t.Fatalf("participant-live = %v", got)
	}
	if saved, _ := store.ParticipantNotes(user); !strings.Contains(string(saved), `"model":"opus-5"`) {
		t.Fatalf("saved notes = %s", saved)
	}
	// セッション id が空なら何もしない
	model(`{"sessionId":"","model":"x"}`)
	if len(hub.heardModels) != 0 || noteOf(hub, p1).Model != "opus-5" {
		t.Fatalf("an empty session: %v", hub.heardModels)
	}

	// join で MCP が運ぶ前
	model(`{"sessionId":"S2","model":"sonnet"}`)
	p2 := joinedID(t, s.URL, `{"ai":"codex","model":"gpt","env":"linux","link":"L2","sessionId":"S2"}`)
	if n := noteOf(hub, p2); n.Model != "sonnet" || len(hub.heardModels) != 0 {
		t.Fatalf("join: %+v, %v", n, hub.heardModels)
	}

	// UserPromptSubmit のフックが結ぶ前
	model(`{"sessionId":"S3","model":"haiku"}`)
	p3 := joinedID(t, s.URL, `{"ai":"claude","model":"opus","env":"linux","link":"6f1c2a3e-1111-4222-8333-444455556666"}`)
	call(t, "POST", s.URL+"/api/ai/talked", `{"sessionId":"S3","host":"300","candidates":["6f1c2a3e-1111-4222-8333-444455556666"]}`, nil)
	if n := noteOf(hub, p3); n.SessionID != "S3" || n.Model != "haiku" || n.Host != "300" || len(hub.heardModels) != 0 {
		t.Fatalf("talked: %+v, %v", n, hub.heardModels)
	}
	if got := hub.ParticipantLive(); got[p2].Model != "sonnet" || got[p3].Model != "haiku" {
		t.Fatalf("live = %v", got)
	}

	// 同じセッションに結ばれた参加者みなに届く（覚えていた物を移したあとに結ばれた参加者にも）
	model(`{"sessionId":"S4","model":"opus-6"}`)
	p4 := joinedID(t, s.URL, `{"ai":"codex","model":"gpt","env":"linux","link":"L4","sessionId":"S4"}`)
	p5 := joinedID(t, s.URL, `{"ai":"codex","model":"gpt","env":"linux","link":"L5","sessionId":"S4"}`)
	if noteOf(hub, p4).Model != "opus-6" || noteOf(hub, p5).Model != "opus-6" {
		t.Fatalf("shared session: %+v, %+v", noteOf(hub, p4), noteOf(hub, p5))
	}
	model(`{"sessionId":"S4","model":"opus-7"}`)
	if noteOf(hub, p4).Model != "opus-7" || noteOf(hub, p5).Model != "opus-7" {
		t.Fatalf("shared session after a switch: %+v, %+v", noteOf(hub, p4), noteOf(hub, p5))
	}
}

// 結ばれていないセッションのモデルは、古くなったものと、上限を超えた分（知らせた時点の古いもの）を捨てる
func TestHeardModelsAreDroppedWhenOldOrTooMany(t *testing.T) {
	_, hub := joinWorld(t, joinStore(t))
	t0 := time.Date(2026, 11, 12, 0, 0, 0, 0, time.UTC)
	if err := hub.HeardModel("old", "m", "", t0); err != nil {
		t.Fatal(err)
	}
	if err := hub.HeardModel("S0", "m", "", t0.Add(heardModelKeep+time.Minute)); err != nil {
		t.Fatal(err)
	}
	if _, ok := hub.heardModels["old"]; ok {
		t.Fatal("an old one was kept")
	}
	for i := 1; i <= heardModelsMax; i++ {
		_ = hub.HeardModel("S"+strconv.Itoa(i), "m", "", t0.Add(heardModelKeep+time.Duration(i+1)*time.Minute))
	}
	if _, ok := hub.heardModels["S0"]; ok || len(hub.heardModels) != heardModelsMax {
		t.Fatalf("kept %d, S0 kept: %v", len(hub.heardModels), ok)
	}
}

// セッション id が変わっても（/clear）、AI のプログラムのプロセス id が同じ参加者に、モデルのフックとUserPromptSubmit のフックが新しいセッション id を結び直す。
// 結んだ所と伝えた印は変えず、プロセス id が空なら結び直さない。join でセッション id を運んだ参加者は、プロセス id が同じでも結び直さない
// （Codex の app-server では、マシンの全部の会話のプロセス id が同じ）
func TestHostRebindsANewSession(t *testing.T) {
	s, hub := joinWorld(t, joinStore(t))
	carried := joinedID(t, s.URL, joinBody("L1", ""))
	acceptRoom(t, s.URL, carried, "ひよこ")
	call(t, "GET", s.URL+"/api/ai/books", "", map[string]string{ParticipantHeader: carried, BranchHeader: "", HostHeader: "100"})
	if n := noteOf(hub, carried); n.SessionID != "S1" || n.Host != "100" || !n.Told || n.BoundBy != boundByJoin {
		t.Fatalf("carried = %+v", n)
	}
	// 準備中（受け入れたが、フックがまだ参加を伝えていない）の参加者は、AI のプログラムのプロセス id もブランチも残さない
	id := joinedID(t, s.URL, `{"ai":"claude","model":"opus","env":"linux","link":"L2"}`)
	acceptRoom(t, s.URL, id, "すずめ")
	call(t, "GET", s.URL+"/api/ai/books", "", map[string]string{ParticipantHeader: id, BranchHeader: "main", HostHeader: "100"})
	if n := noteOf(hub, id); n.Host != "" || n.Branch != "" {
		t.Fatalf("noted while preparing: %+v", n)
	}
	call(t, "POST", s.URL+"/api/ai/talked", `{"sessionId":"C1","host":"100","candidates":["L2"]}`, nil)
	if n := noteOf(hub, id); n.SessionID != "C1" || n.Host != "100" || !n.Told || n.BoundBy != boundByHook {
		t.Fatalf("bound by the hook = %+v", n)
	}

	call(t, "POST", s.URL+"/api/ai/model", `{"sessionId":"S5","host":""}`, nil)
	if n := noteOf(hub, id); n.SessionID != "C1" {
		t.Fatalf("rebound without a host: %+v", n)
	}
	call(t, "POST", s.URL+"/api/ai/model", `{"sessionId":"S5","host":"999"}`, nil)
	if n := noteOf(hub, id); n.SessionID != "C1" {
		t.Fatalf("rebound by another host: %+v", n)
	}
	call(t, "POST", s.URL+"/api/ai/model", `{"sessionId":"S5","host":"100"}`, nil)
	if n := noteOf(hub, id); n.SessionID != "S5" || n.BoundBy != boundByHook || !n.Told {
		t.Fatalf("by model: %+v", n)
	}

	out, _ := call(t, "POST", s.URL+"/api/ai/talked", `{"sessionId":"S6","host":"100"}`, nil)
	var r SessionTalk
	_ = json.Unmarshal([]byte(out), &r)
	if n := noteOf(hub, id); n.SessionID != "S6" || r.Unbound || len(r.Welcomes) != 0 {
		t.Fatalf("by talked: %+v, %s", n, out)
	}
	if n := noteOf(hub, carried); n.SessionID != "S1" {
		t.Fatalf("the participant whose join carried the session was rebound: %+v", n)
	}
}
