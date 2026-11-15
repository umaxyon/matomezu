package server

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"slices"
	"strconv"
	"strings"
	"testing"
	"testing/fstest"

	"github.com/umaxyon/matomezu/internal/engine"
	"github.com/umaxyon/matomezu/internal/storage"
)

// joinWorld は、置き場所 store の上に立てた常駐と、その Hub
func joinWorld(t *testing.T, store storage.Storage) (*httptest.Server, *Hub) {
	t.Helper()
	eng, err := engine.New()
	if err != nil {
		t.Fatal(err)
	}
	hub, err := NewHub(store, eng)
	if err != nil {
		t.Fatal(err)
	}
	web := fstest.MapFS{"index.html": {Data: []byte("top")}}
	cookies := NewScreenCookies(nil, nil)
	s := httptest.NewServer(Handler(Options{Web: web, Token: "secret", Version: "v1", Hub: hub, Cookies: cookies}))
	cookieTestBrowser(t, s, cookies)
	t.Cleanup(func() { s.Close(); hub.CloseAll() })
	return s, hub
}

func joinStore(t *testing.T) storage.Storage {
	t.Helper()
	store, err := storage.OpenSQLite(filepath.Join(t.TempDir(), "data.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { store.Close() })
	return store
}

// call は合言葉と header を付けて呼び、本文と返事のヘッダを返す
func call(t *testing.T, method, url, body string, header map[string]string) (string, http.Header) {
	t.Helper()
	req, _ := http.NewRequest(method, url, strings.NewReader(body))
	req.Header.Set("Authorization", "Bearer secret")
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Cookie", testCookie(url))
	for k, v := range header {
		req.Header.Set(k, v)
	}
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()
	b, _ := io.ReadAll(res.Body)
	return strings.TrimSpace(string(b)), res.Header
}

func joinBody(link, sessionName string) string {
	return `{"ai":"claude","model":"opus","env":"wsl-linux","sessionName":"` + sessionName + `","link":"` + link + `","sessionId":"S1"}`
}

// 参加を頼むと参加者と郵便が 1 つずつできる。同じ link をまた送っても増えず、参加の id が付いていて参加（要求）中でも、弾かずにいる参加者のまま答える
func TestJoinMakesOneParticipantAndOneMail(t *testing.T) {
	s, hub := joinWorld(t, joinStore(t))
	got, _ := call(t, "POST", s.URL+"/api/ai/join", joinBody("L1", ""), nil)
	var first Joined
	if json.Unmarshal([]byte(got), &first) != nil || !first.OK || first.Participant == "" {
		t.Fatalf("join = %s", got)
	}
	count := func() (int, int) {
		rows, mails := table(t, s.URL)
		for _, m := range mails {
			if m.Props.Participant == "" {
				t.Fatalf("mail = %+v", m)
			}
		}
		return len(rows), len(mails)
	}
	if p, m := count(); p != 1 || m != 1 {
		t.Fatalf("participants = %d, mails = %d", p, m)
	}
	if again, _ := call(t, "POST", s.URL+"/api/ai/join", joinBody("L1", ""), nil); again != got {
		t.Fatalf("the same link = %s; want %s", again, got)
	}
	if p, m := count(); p != 1 || m != 1 {
		t.Fatalf("after the same link: participants = %d, mails = %d", p, m)
	}
	// 参加の id が付いていれば、弾かずに同じ参加者のまま答える（参加者も郵便も増えない）
	again, _ := call(t, "POST", s.URL+"/api/ai/join", joinBody("L2", ""), map[string]string{ParticipantHeader: first.Participant})
	if again != `{"ok":true,"participant":"`+first.Participant+`"}` {
		t.Fatalf("with the participant's id = %s", again)
	}
	if p, m := count(); p != 1 || m != 1 {
		t.Fatalf("after the participant's id: participants = %d, mails = %d", p, m)
	}
	// id が無いときは、ai・env・sessionName が全部同じ（sessionName が空でない）参加者があれば弾く
	call(t, "POST", s.URL+"/api/ai/join", joinBody("L3", "work"), nil)
	if refused, _ := call(t, "POST", s.URL+"/api/ai/join", joinBody("L4", "work"), nil); !strings.Contains(refused, `"reason":"already-participating"`) {
		t.Fatalf("with the same session name = %s", refused)
	}
	if p, m := count(); p != 2 || m != 2 {
		t.Fatalf("participants = %d, mails = %d", p, m)
	}
	hub.mu.Lock()
	defer hub.mu.Unlock()
	if hub.participantNotes[first.Participant].SessionID != "S1" {
		t.Fatalf("notes = %+v", hub.participantNotes)
	}
}

// 参加の id の付いた呼び出しは常駐だけが持つ参加者の記録の最後に呼ばれた時刻を更新し（残さない）、参加（joined）の知らせは 1 度だけ返す（起動し直しても繰り返さない）
func TestParticipantCallsAreNotedAndJoinedIsToldOnce(t *testing.T) {
	store := joinStore(t)
	s, hub := joinWorld(t, store)
	got, _ := call(t, "POST", s.URL+"/api/ai/join", joinBody("L1", ""), nil)
	var joined Joined
	_ = json.Unmarshal([]byte(got), &joined)
	id := map[string]string{ParticipantHeader: joined.Participant}

	if _, h := call(t, "GET", s.URL+"/api/ai/books", "", id); h.Get(NoticeHeader) != "" {
		t.Fatalf("a notice before joining = %q", h.Get(NoticeHeader))
	}
	// join で MCP がセッション id を運んだ AI は準備中でない
	if ready := hub.ParticipantReady(); len(ready) != 1 || ready[0] != joined.Participant {
		t.Fatalf("ready = %v", ready)
	}
	// 参加が済むまで（要求中）は、呼ばれた時刻を残さない
	hub.mu.Lock()
	called := hub.participantNotes[joined.Participant].Called
	hub.mu.Unlock()
	if called != "" {
		t.Fatalf("a call before joining was noted: %q", called)
	}
	if saved, _ := store.ParticipantNotes(user); strings.Contains(string(saved), "alled") || !strings.Contains(string(saved), `"sessionId":"S1"`) {
		t.Fatalf("saved notes = %s", saved)
	}

	acceptRoom(t, s.URL, joined.Participant, "ひよこ")
	if _, h := call(t, "GET", s.URL+"/api/ai/books", "", nil); h.Get(NoticeHeader) != "" {
		t.Fatalf("a notice without the participant's id = %q", h.Get(NoticeHeader))
	}
	_, h := call(t, "GET", s.URL+"/api/ai/books", "", id)
	if text, _ := url.QueryUnescape(h.Get(NoticeHeader)); text != "You joined matomezu. Workroom name: ひよこ\n"+joinedAllowText {
		t.Fatalf("notice = %q", text)
	}
	hub.mu.Lock()
	called = hub.participantNotes[joined.Participant].Called
	hub.mu.Unlock()
	if called == "" {
		t.Fatal("the call after joining was not noted")
	}
	if _, h := call(t, "GET", s.URL+"/api/ai/books", "", id); h.Get(NoticeHeader) != "" {
		t.Fatalf("told twice: %q", h.Get(NoticeHeader))
	}
	s2, _ := joinWorld(t, store)
	if _, h := call(t, "GET", s2.URL+"/api/ai/books", "", id); h.Get(NoticeHeader) != "" {
		t.Fatalf("told again after a restart: %q", h.Get(NoticeHeader))
	}
}

// 断られた（表から消えた）参加の id の呼び出しには、1 度だけ断られた知らせを返す。要求中の呼び出しは、時刻を残さず、窓にも知らせない
func TestDeclinedParticipantIsToldOnce(t *testing.T) {
	s, hub := joinWorld(t, joinStore(t))
	got, _ := call(t, "POST", s.URL+"/api/ai/join", joinBody("L1", ""), nil)
	var joined Joined
	_ = json.Unmarshal([]byte(got), &joined)
	id := map[string]string{ParticipantHeader: joined.Participant}

	call(t, "GET", s.URL+"/api/ai/books", "", id)
	if calls := hub.ParticipantCalls(); calls[joined.Participant] != "" {
		t.Fatalf("calls = %v", calls)
	}

	call(t, "POST", s.URL+"/api/perform", `{"action":"@matomezu/base:participant-decline","args":{},"on":{"record":"`+joined.Participant+`"},"lang":"ja","now":"2026-11-08T01:00:00.000Z"}`, nil)
	_, h := call(t, "GET", s.URL+"/api/ai/books", "", id)
	if text, _ := url.QueryUnescape(h.Get(NoticeHeader)); !strings.Contains(text, "declined") {
		t.Fatalf("notice = %q", text)
	}
	if _, h := call(t, "GET", s.URL+"/api/ai/books", "", id); h.Get(NoticeHeader) != "" {
		t.Fatalf("told twice: %q", h.Get(NoticeHeader))
	}
}

// 参加が済んでからの最後に呼ばれた時刻は、短い間に重ねて窓に知らせない
func TestCallsAreNotAnnouncedEveryTime(t *testing.T) {
	s, hub := joinWorld(t, joinStore(t))
	got, _ := call(t, "POST", s.URL+"/api/ai/join", joinBody("L1", ""), nil)
	var joined Joined
	_ = json.Unmarshal([]byte(got), &joined)
	id := map[string]string{ParticipantHeader: joined.Participant}
	acceptRoom(t, s.URL, joined.Participant, "ひよこ") // join で MCP がセッション id を運んでいるので、受け入れで準備中でなくなる

	hub.mu.Lock()
	c := &client{id: "w1", ch: make(chan event, 16)}
	hub.clients["w1"] = c
	hub.mu.Unlock()
	drain := func() (n int) {
		for {
			select {
			case e := <-c.ch:
				if e.name == "participant-calls" {
					n++
				}
			default:
				return
			}
		}
	}
	call(t, "GET", s.URL+"/api/ai/books", "", id)
	call(t, "GET", s.URL+"/api/ai/books", "", id)
	if n := drain(); n != 1 {
		t.Fatalf("participant-calls events = %d, want 1", n)
	}
	if calls := hub.ParticipantCalls(); calls[joined.Participant] == "" {
		t.Fatalf("calls = %v", calls)
	}
}

// acceptRoom は、利用者が要求中の参加者 participant を、名前 room の新しい部屋に受け入れる（部屋を作って入れる）。入れるアクションの答えを返す
func acceptRoom(t *testing.T, url, participant, room string) string {
	t.Helper()
	made, _ := call(t, "POST", url+"/api/perform", `{"action":"@matomezu/base:workroom-add","args":{"name":"`+room+`","bird":"inko"},"lang":"ja","now":"2026-11-08T00:59:00.000Z"}`, nil)
	var out struct{ Result struct{ Workroom string } }
	if json.Unmarshal([]byte(made), &out) != nil || out.Result.Workroom == "" {
		return made
	}
	return acceptIn(t, url, participant, out.Result.Workroom)
}

// acceptIn は、要求中の参加者 participant を、今ある部屋 room（id）に受け入れる。答えを返す
func acceptIn(t *testing.T, url, participant, room string) string {
	t.Helper()
	got, _ := call(t, "POST", url+"/api/perform", `{"action":"@matomezu/base:participant-accept","args":{"workroom":"`+room+`"},"on":{"record":"`+participant+`"},"lang":"ja","now":"2026-11-08T01:00:00.000Z"}`, nil)
	return got
}

// recordsOf は /api/data の、種類 subject のレコード（id → 中身）
func recordsOf(t *testing.T, url, subject string) map[string]map[string]any {
	t.Helper()
	body, _ := call(t, "GET", url+"/api/data", "", nil)
	var data struct {
		Records map[string]map[string]map[string]any `json:"records"`
	}
	if err := json.Unmarshal([]byte(body), &data); err != nil {
		t.Fatal(err)
	}
	return data.Records[subject]
}

const (
	participantKind = "@matomezu/base:participant"
	workroomKind    = "@matomezu/base:workroom"
	mailKind        = "@matomezu/base:mail"
)

// ターンを始めたセッションが誰にも結ばれていなければ unbound を返し、候補に link が合えば結ぶ。
// 受け入れ済みで伝えていない参加者は、結ばれたセッションのターンの始まりで 1 度だけ伝え（MCP の返事の知らせとは二重にならない）、ほかのセッションには伝えない
func TestTalkedBindsTheSessionByLinkAndWelcomesOnce(t *testing.T) {
	s, hub := joinWorld(t, joinStore(t))
	got, _ := call(t, "POST", s.URL+"/api/ai/join", `{"ai":"claude","model":"opus","env":"wsl-linux","link":"6F1C2A3E-1111-4222-8333-444455556666"}`, nil)
	var joined Joined
	_ = json.Unmarshal([]byte(got), &joined)
	talk := func(body string) SessionTalk {
		out, _ := call(t, "POST", s.URL+"/api/ai/talked", body, nil)
		var r SessionTalk
		if err := json.Unmarshal([]byte(out), &r); err != nil {
			t.Fatalf("talked = %q", out)
		}
		return r
	}
	if r := talk(`{"sessionId":"S9"}`); !r.Unbound || len(r.Welcomes) != 0 {
		t.Fatalf("unbound session = %+v", r)
	}
	// 候補に合う link が無ければ結ばれない
	if r := talk(`{"sessionId":"S9","candidates":["00000000-0000-4000-8000-000000000000"]}`); !r.Unbound {
		t.Fatalf("no match = %+v", r)
	}
	// link が合えば（大文字小文字は問わない）結ぶ。まだ受け入れていないので伝えない
	if r := talk(`{"sessionId":"S9","candidates":["6f1c2a3e-1111-4222-8333-444455556666"]}`); r.Unbound || len(r.Welcomes) != 0 {
		t.Fatalf("bound but not accepted = %+v", r)
	}
	if r := talk(`{"sessionId":"S9"}`); r.Unbound || len(r.Welcomes) != 0 {
		t.Fatalf("a bound session = %+v", r)
	}
	acceptRoom(t, s.URL, joined.Participant, "ひよこ")
	// 別のセッションには伝えない
	if r := talk(`{"sessionId":"S8"}`); len(r.Welcomes) != 0 {
		t.Fatalf("another session = %+v", r)
	}
	// フックが伝えるまでは準備中。MCP が参加の id を名乗っても、知らせも最後に呼ばれた時刻も残さない
	mcp := map[string]string{ParticipantHeader: joined.Participant}
	if _, h := call(t, "GET", s.URL+"/api/ai/books", "", mcp); h.Get(NoticeHeader) != "" {
		t.Fatalf("MCP told while preparing: %q", h.Get(NoticeHeader))
	}
	if calls := hub.ParticipantCalls(); calls[joined.Participant] != "" {
		t.Fatalf("calls while preparing = %v", calls)
	}
	if ready := hub.ParticipantReady(); len(ready) != 0 {
		t.Fatalf("ready while preparing = %v", ready)
	}
	r := talk(`{"sessionId":"S9"}`)
	if len(r.Welcomes) != 1 || r.Welcomes[0].Workroom != "ひよこ" || r.Welcomes[0].ForAI != "You joined matomezu. Workroom name: ひよこ\n"+joinedAllowText ||
		!strings.Contains(r.Welcomes[0].Message, "ひよこ") {
		t.Fatalf("welcome = %+v", r)
	}
	if r := talk(`{"sessionId":"S9"}`); len(r.Welcomes) != 0 {
		t.Fatalf("told twice = %+v", r)
	}
	// 伝えたときが最後に呼ばれた時刻になり、準備中でなくなる。そのあとのターンの始まりは時刻を進めない
	at := hub.ParticipantCalls()[joined.Participant]
	if at == "" {
		t.Fatal("the welcome did not set the last called time")
	}
	if ready := hub.ParticipantReady(); len(ready) != 1 || ready[0] != joined.Participant {
		t.Fatalf("ready after the welcome = %v", ready)
	}
	talk(`{"sessionId":"S9"}`)
	if now := hub.ParticipantCalls()[joined.Participant]; now != at {
		t.Fatalf("a talk moved the time: %q -> %q", at, now)
	}
	// 伝えたので、MCP の返事には添えない
	if _, h := call(t, "GET", s.URL+"/api/ai/books", "", map[string]string{ParticipantHeader: joined.Participant}); h.Get(NoticeHeader) != "" {
		t.Fatalf("told by the hook and then by MCP: %q", h.Get(NoticeHeader))
	}
}

// MCP の返事で先に伝えたときは、UserPromptSubmit のフックは伝えない
func TestTalkedDoesNotWelcomeWhatMCPToldFirst(t *testing.T) {
	s, _ := joinWorld(t, joinStore(t))
	got, _ := call(t, "POST", s.URL+"/api/ai/join", joinBody("L1", ""), nil)
	var joined Joined
	_ = json.Unmarshal([]byte(got), &joined)
	acceptRoom(t, s.URL, joined.Participant, "ひよこ")
	if _, h := call(t, "GET", s.URL+"/api/ai/books", "", map[string]string{ParticipantHeader: joined.Participant}); h.Get(NoticeHeader) == "" {
		t.Fatal("MCP did not tell")
	}
	// join のときに添えられたセッション id（S1）でターンを始める
	out, _ := call(t, "POST", s.URL+"/api/ai/talked", `{"sessionId":"S1"}`, nil)
	if !strings.Contains(out, `"welcomes":[]`) {
		t.Fatalf("talked = %s", out)
	}
}

// 参加の id の持ち主は、生きていなくても（最後に呼ばれてから長くたっていても）つなぎ直さずに続けられる。弾かれも、断られた知らせも出ない
func TestParticipantIdHolderContinuesWhenNotAlive(t *testing.T) {
	s, hub := joinWorld(t, joinStore(t))
	got, _ := call(t, "POST", s.URL+"/api/ai/join", joinBody("L1", ""), nil)
	var joined Joined
	_ = json.Unmarshal([]byte(got), &joined)
	acceptRoom(t, s.URL, joined.Participant, "ひよこ")
	id := map[string]string{ParticipantHeader: joined.Participant}
	call(t, "GET", s.URL+"/api/ai/books", "", id) // 伝える
	hub.mu.Lock()
	n := hub.participantNotes[joined.Participant]
	n.Called = "2020-01-01T00:00:00.000Z"
	hub.participantNotes[joined.Participant] = n
	hub.mu.Unlock()
	if _, h := call(t, "GET", s.URL+"/api/ai/books", "", id); h.Get(NoticeHeader) != "" {
		t.Fatalf("a notice for the old participant = %q", h.Get(NoticeHeader))
	}
	again, _ := call(t, "POST", s.URL+"/api/ai/join", joinBody("L2", ""), id)
	if !strings.Contains(again, `"ok":true`) || !strings.Contains(again, joined.Participant) {
		t.Fatalf("join with the id = %s", again)
	}
}

func joinWith(link, sessionName, extra string) string {
	return `{"ai":"claude","model":"opus","env":"wsl-linux","sessionName":"` + sessionName + `","link":"` + link + `"` + extra + `}`
}

type tableRow struct {
	ID         string `json:"id"`
	State      string `json:"state"`
	Link       string `json:"link"`
	Workroom   string `json:"workroom"`   // 入っているワークルームの id（受け入れ済みだけ）
	WantedName string `json:"wantedName"` // 要求中が入りたい部屋の名前
	Room       string `json:"-"`          // 入っているワークルームの名前
	Bird       string `json:"-"`          // 入っているワークルームの鳥
}

// table は /api/data の参加者（要求が届いた順）と、郵便。入っているワークルームの名前と鳥は Room・Bird に引く
func table(t *testing.T, base string) (rows []tableRow, mails []struct {
	Props struct {
		Participant string `json:"participant"`
		Workroom    string `json:"workroom"`
	} `json:"props"`
}) {
	t.Helper()
	var data struct {
		Records map[string]map[string]json.RawMessage `json:"records"`
	}
	body, _ := call(t, "GET", base+"/api/data", "", nil)
	if err := json.Unmarshal([]byte(body), &data); err != nil {
		t.Fatal(err)
	}
	rooms := map[string]struct{ Name, Bird string }{}
	for id, raw := range data.Records[workroomKind] {
		var r struct{ Name, Bird string }
		_ = json.Unmarshal(raw, &r)
		rooms[id] = r
	}
	type withTime struct {
		row tableRow
		at  string
	}
	var found []withTime
	for _, raw := range data.Records[participantKind] {
		var r tableRow
		var at struct {
			RequestedAt string `json:"requestedAt"`
		}
		_ = json.Unmarshal(raw, &r)
		_ = json.Unmarshal(raw, &at)
		r.Room, r.Bird = rooms[r.Workroom].Name, rooms[r.Workroom].Bird
		found = append(found, withTime{r, at.RequestedAt})
	}
	slices.SortFunc(found, func(a, b withTime) int { return strings.Compare(a.at+a.row.ID, b.at+b.row.ID) })
	for _, f := range found {
		rows = append(rows, f.row)
	}
	// 郵便は届いた順（order）に並べる
	type withOrder struct {
		order int
		raw   json.RawMessage
	}
	var letters []withOrder
	for _, raw := range data.Records[mailKind] {
		var m struct{ Order int }
		_ = json.Unmarshal(raw, &m)
		letters = append(letters, withOrder{m.Order, raw})
	}
	slices.SortFunc(letters, func(a, b withOrder) int { return a.order - b.order })
	for _, l := range letters {
		var m struct {
			Props struct {
				Participant string `json:"participant"`
				Workroom    string `json:"workroom"`
			} `json:"props"`
		}
		_ = json.Unmarshal(l.raw, &m)
		mails = append(mails, m)
	}
	return rows, mails
}

// 名前の参加者が生きているあいだ、その名前で引き継ごうとしても断る。参加者は増えず、郵便も出ない。名前の参加者が居なければ、名前は新しい参加者の初めの値になる
func TestJoinWithAWorkroomIsRefusedWhileItsParticipantIsAlive(t *testing.T) {
	s, _ := joinWorld(t, joinStore(t))
	got, _ := call(t, "POST", s.URL+"/api/ai/join", joinWith("L1", "", `,"sessionId":"S1"`), nil)
	var first Joined
	_ = json.Unmarshal([]byte(got), &first)
	acceptRoom(t, s.URL, first.Participant, "ひよこ")
	call(t, "GET", s.URL+"/api/ai/books", "", map[string]string{ParticipantHeader: first.Participant}) // 呼ばれた: 生きている

	refused, _ := call(t, "POST", s.URL+"/api/ai/join", joinWith("L2", "", `,"workroom":"ひよこ"`), nil)
	if !strings.Contains(refused, `"ok":false`) || !strings.Contains(refused, `"reason":"workroom-in-use"`) || !strings.Contains(refused, "already has a participant") {
		t.Fatalf("join = %s", refused)
	}
	if rows, mails := table(t, s.URL); len(rows) != 1 || len(mails) != 1 {
		t.Fatalf("participants = %v, mails = %d", rows, len(mails))
	}
	// 名前の参加者が居なければ、新しい参加者の名前の初めの値
	fresh, _ := call(t, "POST", s.URL+"/api/ai/join", joinWith("L3", "", `,"workroom":"ぴよ"`), nil)
	if !strings.Contains(fresh, `"ok":true`) || strings.Contains(fresh, "takeover") {
		t.Fatalf("a new name = %s", fresh)
	}
	rows, mails := table(t, s.URL)
	if len(rows) != 2 || rows[1].State != "requested" || rows[1].WantedName != "ぴよ" || len(mails) != 2 || mails[1].Props.Workroom != "ぴよ" {
		t.Fatalf("participants = %+v, mails = %+v", rows, mails)
	}
}

// 生きていない参加者の名前で頼むと、頼まれた名前を添えた普通の参加の要求（参加者の要求と郵便）を出す。同じ AI・環境・セッション名でも断らない。
// 利用者が引き継ぐを選ぶと（participant-take-over）、要求した参加者が名前・鳥を引き継いで受け入れ済みになり、元の参加者は表から無くなる。新しい参加者には「参加しました」がまだ伝わっていない
func TestJoinWithAWorkroomOfAQuietParticipantCanBeAcceptedByTakingOver(t *testing.T) {
	s, hub := joinWorld(t, joinStore(t))
	got, _ := call(t, "POST", s.URL+"/api/ai/join", joinWith("L1", "work", ""), nil)
	var first Joined
	_ = json.Unmarshal([]byte(got), &first)
	acceptRoom(t, s.URL, first.Participant, "ひよこ")

	// 呼ばれたことがない（起動し直した後など）のは生きていない。同じ名前の頼みでも、通常の参加の「すでに参加済み」では断らない
	asked, _ := call(t, "POST", s.URL+"/api/ai/join", joinWith("L2", "work", `,"workroom":"ひよこ","sessionId":"S2"`), nil)
	var second Joined
	if json.Unmarshal([]byte(asked), &second) != nil || !second.OK || second.Participant == first.Participant {
		t.Fatalf("join = %s", asked)
	}
	rows, mails := table(t, s.URL)
	if len(rows) != 2 || rows[1].State != "requested" || rows[1].WantedName != "ひよこ" || len(mails) != 2 || mails[1].Props.Workroom != "ひよこ" || mails[1].Props.Participant != second.Participant {
		t.Fatalf("participants = %+v, mails = %+v", rows, mails)
	}
	// 同じ名前では、普通の受け入れでは受け入れられない（引き継ぐか、外して始める）
	if out := acceptRoom(t, s.URL, second.Participant, "ひよこ"); !strings.Contains(out, `"ok":false`) {
		t.Fatalf("accept with the same name = %s", out)
	}
	// 引き継ぎは、前の参加者を外してから、同じ部屋に受け入れる
	oldRows, _ := table(t, s.URL)
	room := oldRows[0].Workroom
	if out, _ := call(t, "POST", s.URL+"/api/perform", `{"action":"@matomezu/base:participant-remove","args":{},"on":{"record":"`+first.Participant+`"},"lang":"ja","now":"2026-11-08T02:00:00.000Z"}`, nil); !strings.Contains(out, `"ok":true`) {
		t.Fatalf("remove = %s", out)
	}
	if out := acceptIn(t, s.URL, second.Participant, room); !strings.Contains(out, `"ok":true`) {
		t.Fatalf("take over = %s", out)
	}
	rows, _ = table(t, s.URL)
	if len(rows) != 1 || rows[0].ID != second.Participant || rows[0].State != "joined" || rows[0].Room != "ひよこ" || rows[0].Bird != "inko" {
		t.Fatalf("after: %+v", rows)
	}
	// 新しい持ち主には MCP の返事で伝わる。元の持ち主の id は表に無いので断られた知らせ
	if _, h := call(t, "GET", s.URL+"/api/ai/books", "", map[string]string{ParticipantHeader: second.Participant}); h.Get(NoticeHeader) == "" {
		t.Fatal("the new owner was not welcomed")
	}
	if _, h := call(t, "GET", s.URL+"/api/ai/books", "", map[string]string{ParticipantHeader: first.Participant}); !strings.Contains(h.Get(NoticeHeader), "declined") {
		t.Fatalf("the old owner = %q", h.Get(NoticeHeader))
	}
	// 呼ばれて時間がたった（有効時間を過ぎた）参加者の名前も引き継げる
	hub.mu.Lock()
	n := hub.participantNotes[second.Participant]
	n.Called = "2020-01-01T00:00:00.000Z"
	hub.participantNotes[second.Participant] = n
	hub.mu.Unlock()
	again, _ := call(t, "POST", s.URL+"/api/ai/join", joinWith("L3", "", `,"workroom":"ひよこ"`), nil)
	if !strings.Contains(again, `"ok":true`) {
		t.Fatalf("after a long quiet = %s", again)
	}
}

// 参加を伝える文は、利用者の言語の文言の表から作る
func TestJoinedTextComesFromTheMessageTable(t *testing.T) {
	s, hub := joinWorld(t, joinStore(t))
	if got := hub.userJoinedText("ひよこ"); got != "Joined matomezu. Workroom name: ひよこ" {
		t.Fatalf("en = %q", got)
	}
	call(t, "POST", s.URL+"/api/perform", `{"action":"@matomezu/base:settings-set","args":{"values":{"@matomezu/base:lang":"matomezu:ja"}},"lang":"ja"}`, nil)
	if got := hub.userJoinedText("ひよこ"); got != "matomezu に参加しました。ワークルーム名: ひよこ" {
		t.Fatalf("ja = %q", got)
	}
}

// 居なくなったプロセスの pid（終わらせて待った子プロセスの pid）
func deadPid(t *testing.T) string {
	t.Helper()
	cmd := exec.Command(os.Args[0], "-test.run=^$")
	if err := cmd.Run(); err != nil {
		t.Fatal(err)
	}
	return strconv.Itoa(cmd.ProcessState.Pid())
}

// AI のセッションごとのプロセスだと名乗った Host が居なくなった参加者の部屋に、同じ名前で join すると、その参加者は退室して（部屋は空室になり）join が通る。
// 名乗っていない・範囲の印が違う・Host が居る参加者の部屋には、生きているあいだ workroom-in-use で断る
func TestJoinFreesTheRoomOfAParticipantWhoseHostProgramEnded(t *testing.T) {
	cases := []struct {
		name   string
		header func(dead string) map[string]string
		frees  bool
	}{
		{"the host is gone", func(dead string) map[string]string {
			return map[string]string{HostHeader: dead, HostScopeHeader: "process", HostSpaceHeader: ProcessSpace()}
		}, true},
		{"the host is alive", func(string) map[string]string {
			return map[string]string{HostHeader: strconv.Itoa(os.Getpid()), HostScopeHeader: "process", HostSpaceHeader: ProcessSpace()}
		}, false},
		{"another space (the pid cannot be checked here)", func(dead string) map[string]string {
			return map[string]string{HostHeader: dead, HostScopeHeader: "process", HostSpaceHeader: "elsewhere"}
		}, false},
		{"not said to be a process of one session", func(dead string) map[string]string {
			return map[string]string{HostHeader: dead}
		}, false},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			s, _ := joinWorld(t, joinStore(t))
			got, _ := call(t, "POST", s.URL+"/api/ai/join", joinWith("L1", "", `,"sessionId":"S1"`), c.header(deadPid(t)))
			var first Joined
			_ = json.Unmarshal([]byte(got), &first)
			acceptRoom(t, s.URL, first.Participant, "ひよこ")
			call(t, "GET", s.URL+"/api/ai/books", "", map[string]string{ParticipantHeader: first.Participant}) // 呼ばれた: 生きている

			second, _ := call(t, "POST", s.URL+"/api/ai/join", joinWith("L2", "", `,"workroom":"ひよこ"`), nil)
			rows, _ := table(t, s.URL)
			if !c.frees {
				if !strings.Contains(second, `"reason":"workroom-in-use"`) {
					t.Fatalf("join = %s", second)
				}
				return
			}
			var made Joined
			if json.Unmarshal([]byte(second), &made) != nil || !made.OK || made.Participant == first.Participant {
				t.Fatalf("join = %s", second)
			}
			for _, r := range rows {
				if r.ID == first.Participant {
					t.Fatalf("the participant of the ended program is still in the table: %+v", rows)
				}
			}
			if len(rows) != 1 || rows[0].State != "requested" || rows[0].WantedName != "ひよこ" {
				t.Fatalf("participants = %+v", rows)
			}
		})
	}
}
