package server

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"path/filepath"
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
	s := httptest.NewServer(Handler(Options{Web: web, Token: "secret", Version: "v1", Hub: hub}))
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
	return `{"ai":"claude","model":"opus","env":"wsl-linux","sessionName":"` + sessionName + `","link":"` + link + `","sessionId":"S1","projects":["default"]}`
}

// 参加を頼むと参加者と郵便が 1 つずつできる。同じ link をまた送っても増えず、参加の id が付いていて参加（要求）中なら弾く
func TestJoinMakesOneParticipantAndOneMail(t *testing.T) {
	s, hub := joinWorld(t, joinStore(t))
	got, _ := call(t, "POST", s.URL+"/api/ai/join", joinBody("L1", ""), nil)
	var first Joined
	if json.Unmarshal([]byte(got), &first) != nil || !first.OK || first.Participant == "" {
		t.Fatalf("join = %s", got)
	}
	count := func() (int, int) {
		var data struct {
			Participants []json.RawMessage `json:"participants"`
			Mailbox      []struct {
				Mail  string `json:"mail"`
				Props struct {
					Participant string `json:"participant"`
				} `json:"props"`
			} `json:"mailbox"`
		}
		body, _ := call(t, "GET", s.URL+"/api/data", "", nil)
		if err := json.Unmarshal([]byte(body), &data); err != nil {
			t.Fatal(err)
		}
		for _, m := range data.Mailbox {
			if m.Mail != "@matomezu/base:join-request" || m.Props.Participant == "" {
				t.Fatalf("mail = %+v", m)
			}
		}
		return len(data.Participants), len(data.Mailbox)
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
	// 参加の id が付いていれば、弾かずに同じ参加者にプロジェクトを足す（足すものが無ければ変わらない。参加者も郵便も増えない）
	grown, _ := call(t, "POST", s.URL+"/api/ai/join", joinBody("L2", ""), map[string]string{ParticipantHeader: first.Participant})
	if grown != `{"ok":true,"participant":"`+first.Participant+`","projects":["default"]}` {
		t.Fatalf("with the participant's id = %s", grown)
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

// 参加の id の付いた呼び出しは帳簿の最後に呼ばれた時刻を更新し（残さない）、参加（joined）の知らせは 1 度だけ返す（起動し直しても繰り返さない）
func TestParticipantCallsAreNotedAndJoinedIsToldOnce(t *testing.T) {
	store := joinStore(t)
	s, hub := joinWorld(t, store)
	got, _ := call(t, "POST", s.URL+"/api/ai/join", joinBody("L1", ""), nil)
	var joined Joined
	_ = json.Unmarshal([]byte(got), &joined)
	id := map[string]string{ParticipantHeader: joined.Participant}

	if _, h := call(t, "GET", s.URL+"/api/ai/books?projects=default", "", id); h.Get(NoticeHeader) != "" {
		t.Fatalf("a notice before joining = %q", h.Get(NoticeHeader))
	}
	hub.mu.Lock()
	called := hub.participantNotes[joined.Participant].Called
	hub.mu.Unlock()
	if called == "" {
		t.Fatal("the call was not noted")
	}
	if saved, _ := store.ParticipantNotes(user); strings.Contains(string(saved), "alled") || !strings.Contains(string(saved), `"sessionId":"S1"`) {
		t.Fatalf("saved notes = %s", saved)
	}

	call(t, "POST", s.URL+"/api/perform", `{"action":"@matomezu/base:participant-accept","args":{"participant":"`+joined.Participant+`","workroom":"ひよこ","bird":"inko"},"lang":"ja","now":"2026-11-08T01:00:00.000Z"}`, nil)
	if _, h := call(t, "GET", s.URL+"/api/ai/books?projects=default", "", nil); h.Get(NoticeHeader) != "" {
		t.Fatalf("a notice without the participant's id = %q", h.Get(NoticeHeader))
	}
	_, h := call(t, "GET", s.URL+"/api/ai/books?projects=default", "", id)
	if text, _ := url.QueryUnescape(h.Get(NoticeHeader)); text != "You joined matomezu. Workroom name: ひよこ" {
		t.Fatalf("notice = %q", text)
	}
	if _, h := call(t, "GET", s.URL+"/api/ai/books?projects=default", "", id); h.Get(NoticeHeader) != "" {
		t.Fatalf("told twice: %q", h.Get(NoticeHeader))
	}
	s2, _ := joinWorld(t, store)
	if _, h := call(t, "GET", s2.URL+"/api/ai/books?projects=default", "", id); h.Get(NoticeHeader) != "" {
		t.Fatalf("told again after a restart: %q", h.Get(NoticeHeader))
	}
}

// projects は 1 つ以上で、表にあるものだけ。足りなければ参加者を作らない
func TestJoinNeedsKnownProjects(t *testing.T) {
	s, _ := joinWorld(t, joinStore(t))
	for _, projects := range []string{``, `,"projects":[]`, `,"projects":["nowhere"]`, `,"projects":["default","nowhere"]`} {
		body := `{"ai":"claude","model":"opus","env":"wsl-linux","link":"L1"` + projects + `}`
		got, _ := call(t, "POST", s.URL+"/api/ai/join", body, nil)
		if !strings.Contains(got, `"ok":false`) || !strings.Contains(got, `"reason":"refused"`) {
			t.Fatalf("join %q = %s", projects, got)
		}
	}
	if !strings.Contains(joinBodyWith(t, s.URL, `,"projects":["nowhere"]`), "no such project: nowhere (known: default)") {
		t.Fatal("the reason does not name the project")
	}
	data, _ := call(t, "GET", s.URL+"/api/data", "", nil)
	if !strings.Contains(data, `"participants":[]`) || !strings.Contains(data, `"mailbox":[]`) {
		t.Fatalf("data = %s", data)
	}
}

func joinBodyWith(t *testing.T, url, projects string) string {
	t.Helper()
	got, _ := call(t, "POST", url+"/api/ai/join", `{"ai":"claude","model":"opus","env":"wsl-linux","link":"L1"`+projects+`}`, nil)
	return got
}

// 断られた（表から消えた）参加の id の呼び出しには、1 度だけ断られた知らせを返す。最後に呼ばれた時刻は、短い間に重ねて知らせない
func TestDeclinedParticipantIsToldOnceAndCallsAreNotAnnouncedEveryTime(t *testing.T) {
	s, hub := joinWorld(t, joinStore(t))
	got, _ := call(t, "POST", s.URL+"/api/ai/join", joinBody("L1", ""), nil)
	var joined Joined
	_ = json.Unmarshal([]byte(got), &joined)
	id := map[string]string{ParticipantHeader: joined.Participant}

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
	call(t, "GET", s.URL+"/api/ai/books?projects=default", "", id)
	call(t, "GET", s.URL+"/api/ai/books?projects=default", "", id)
	if n := drain(); n != 1 {
		t.Fatalf("participant-calls events = %d, want 1", n)
	}
	if calls := hub.ParticipantCalls(); calls[joined.Participant] == "" {
		t.Fatalf("calls = %v", calls)
	}

	call(t, "POST", s.URL+"/api/perform", `{"action":"@matomezu/base:participant-decline","args":{"participant":"`+joined.Participant+`"},"lang":"ja","now":"2026-11-08T01:00:00.000Z"}`, nil)
	_, h := call(t, "GET", s.URL+"/api/ai/books?projects=default", "", id)
	if text, _ := url.QueryUnescape(h.Get(NoticeHeader)); !strings.Contains(text, "declined") {
		t.Fatalf("notice = %q", text)
	}
	if _, h := call(t, "GET", s.URL+"/api/ai/books?projects=default", "", id); h.Get(NoticeHeader) != "" {
		t.Fatalf("told twice: %q", h.Get(NoticeHeader))
	}
}

func acceptBody(id, workroom string) string {
	return `{"action":"@matomezu/base:participant-accept","args":{"participant":"` + id + `","workroom":"` + workroom + `","bird":"inko"},"lang":"ja","now":"2026-11-08T01:00:00.000Z"}`
}

// 話しかけたセッションが誰にも結ばれていなければ unbound を返し、候補に link が合えば結ぶ。
// 受け入れ済みで伝えていない参加者は、結ばれたセッションの話しかけで 1 度だけ伝え（MCP の返事の知らせとは二重にならない）、ほかのセッションには伝えない
func TestTalkedBindsTheSessionByLinkAndWelcomesOnce(t *testing.T) {
	s, hub := joinWorld(t, joinStore(t))
	got, _ := call(t, "POST", s.URL+"/api/ai/join", `{"ai":"claude","model":"opus","env":"wsl-linux","link":"6F1C2A3E-1111-4222-8333-444455556666","projects":["default"]}`, nil)
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
	call(t, "POST", s.URL+"/api/perform", acceptBody(joined.Participant, "ひよこ"), nil)
	// 別のセッションには伝えない
	if r := talk(`{"sessionId":"S8"}`); len(r.Welcomes) != 0 {
		t.Fatalf("another session = %+v", r)
	}
	r := talk(`{"sessionId":"S9"}`)
	if len(r.Welcomes) != 1 || r.Welcomes[0].Workroom != "ひよこ" || r.Welcomes[0].ForAI != "You joined matomezu. Workroom name: ひよこ" ||
		!strings.Contains(r.Welcomes[0].Message, "ひよこ") {
		t.Fatalf("welcome = %+v", r)
	}
	if r := talk(`{"sessionId":"S9"}`); len(r.Welcomes) != 0 {
		t.Fatalf("told twice = %+v", r)
	}
	// 話しかけは最後に呼ばれた時刻を進めない
	if calls := hub.ParticipantCalls(); calls[joined.Participant] != "" {
		t.Fatalf("calls = %v", calls)
	}
	// 伝えたので、MCP の返事には添えない
	if _, h := call(t, "GET", s.URL+"/api/ai/books?projects=default", "", map[string]string{ParticipantHeader: joined.Participant}); h.Get(NoticeHeader) != "" {
		t.Fatalf("told by the hook and then by MCP: %q", h.Get(NoticeHeader))
	}
}

// MCP の返事で先に伝えたときは、話しかけのフックは伝えない
func TestTalkedDoesNotWelcomeWhatMCPToldFirst(t *testing.T) {
	s, _ := joinWorld(t, joinStore(t))
	got, _ := call(t, "POST", s.URL+"/api/ai/join", joinBody("L1", ""), nil)
	var joined Joined
	_ = json.Unmarshal([]byte(got), &joined)
	call(t, "POST", s.URL+"/api/perform", acceptBody(joined.Participant, "ひよこ"), nil)
	if _, h := call(t, "GET", s.URL+"/api/ai/books?projects=default", "", map[string]string{ParticipantHeader: joined.Participant}); h.Get(NoticeHeader) == "" {
		t.Fatal("MCP did not tell")
	}
	// join のときに添えられたセッション id（S1）で話しかける
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
	call(t, "POST", s.URL+"/api/perform", acceptBody(joined.Participant, "ひよこ"), nil)
	id := map[string]string{ParticipantHeader: joined.Participant}
	call(t, "GET", s.URL+"/api/ai/books?projects=default", "", id) // 伝える
	hub.mu.Lock()
	n := hub.participantNotes[joined.Participant]
	n.Called = "2020-01-01T00:00:00.000Z"
	hub.participantNotes[joined.Participant] = n
	hub.mu.Unlock()
	if _, h := call(t, "GET", s.URL+"/api/ai/books?projects=default", "", id); h.Get(NoticeHeader) != "" {
		t.Fatalf("a notice for the old participant = %q", h.Get(NoticeHeader))
	}
	again, _ := call(t, "POST", s.URL+"/api/ai/join", joinBody("L2", ""), id)
	if !strings.Contains(again, `"ok":true`) || !strings.Contains(again, joined.Participant) {
		t.Fatalf("join with the id = %s", again)
	}
}

func joinWith(link, sessionName, extra string) string {
	return `{"ai":"claude","model":"opus","env":"wsl-linux","sessionName":"` + sessionName + `","link":"` + link + `","projects":["default"]` + extra + `}`
}

type tableRow struct {
	ID       string `json:"id"`
	State    string `json:"state"`
	Link     string `json:"link"`
	Workroom string `json:"workroom"`
	Bird     string `json:"bird"`
	Takeover string `json:"takeover"`
}

func table(t *testing.T, base string) (rows []tableRow, mails []struct {
	Props struct {
		Participant string `json:"participant"`
		Workroom    string `json:"workroom"`
	} `json:"props"`
}) {
	t.Helper()
	var data struct {
		Participants []tableRow `json:"participants"`
		Mailbox      []struct {
			Props struct {
				Participant string `json:"participant"`
				Workroom    string `json:"workroom"`
			} `json:"props"`
		} `json:"mailbox"`
	}
	body, _ := call(t, "GET", base+"/api/data", "", nil)
	if err := json.Unmarshal([]byte(body), &data); err != nil {
		t.Fatal(err)
	}
	return data.Participants, data.Mailbox
}

// 名前の参加者が生きているあいだ、その名前で引き継ごうとしても断る。参加者は増えず、郵便も出ない。名前の参加者が居なければ、名前は新しい参加者の初めの値になる
func TestJoinWithAWorkroomIsRefusedWhileItsParticipantIsAlive(t *testing.T) {
	s, _ := joinWorld(t, joinStore(t))
	got, _ := call(t, "POST", s.URL+"/api/ai/join", joinWith("L1", "", ""), nil)
	var first Joined
	_ = json.Unmarshal([]byte(got), &first)
	call(t, "POST", s.URL+"/api/perform", acceptBody(first.Participant, "ひよこ"), nil)
	call(t, "GET", s.URL+"/api/ai/books?projects=default", "", map[string]string{ParticipantHeader: first.Participant}) // 呼ばれた: 生きている

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
	if len(rows) != 2 || rows[1].State != "requested" || rows[1].Workroom != "ぴよ" || rows[1].Takeover != "" || len(mails) != 2 || mails[1].Props.Workroom != "" {
		t.Fatalf("participants = %+v, mails = %+v", rows, mails)
	}
}

// 生きていない参加者の名前で頼むと、引き継ぎの要求（参加者の要求と引き継ぎの郵便）を出す。同じ AI・環境・セッション名でも断らない。
// 受け入れると、要求した参加者が名前・鳥を引き継いで受け入れ済みになり、元の参加者は表から無くなる。新しい参加者には「参加しました」がまだ伝わっていない
func TestJoinWithAWorkroomOfAQuietParticipantAsksToTakeOver(t *testing.T) {
	s, hub := joinWorld(t, joinStore(t))
	got, _ := call(t, "POST", s.URL+"/api/ai/join", joinWith("L1", "work", ""), nil)
	var first Joined
	_ = json.Unmarshal([]byte(got), &first)
	call(t, "POST", s.URL+"/api/perform", acceptBody(first.Participant, "ひよこ"), nil)

	// 呼ばれたことがない（起動し直した後など）のは生きていない。同じ名前の頼みでも、通常の参加の「すでに参加済み」では断らない
	asked, _ := call(t, "POST", s.URL+"/api/ai/join", joinWith("L2", "work", `,"workroom":"ひよこ"`), nil)
	var second Joined
	if json.Unmarshal([]byte(asked), &second) != nil || !second.OK || second.Takeover != "ひよこ" || second.Participant == first.Participant {
		t.Fatalf("join = %s", asked)
	}
	rows, mails := table(t, s.URL)
	if len(rows) != 2 || rows[1].State != "requested" || rows[1].Takeover != first.Participant || len(mails) != 2 || mails[1].Props.Workroom != "ひよこ" || mails[1].Props.Participant != second.Participant {
		t.Fatalf("participants = %+v, mails = %+v", rows, mails)
	}
	// 引き継ぎの要求は、普通の受け入れでは受け入れられない
	if out, _ := call(t, "POST", s.URL+"/api/perform", acceptBody(second.Participant, "ほか"), nil); !strings.Contains(out, `"ok":false`) {
		t.Fatalf("ordinary accept of a takeover = %s", out)
	}
	if out, _ := call(t, "POST", s.URL+"/api/perform", `{"action":"@matomezu/base:participant-take-over","args":{"participant":"`+second.Participant+`"},"lang":"ja","now":"2026-11-08T02:00:00.000Z"}`, nil); !strings.Contains(out, `"ok":true`) {
		t.Fatalf("take over = %s", out)
	}
	rows, _ = table(t, s.URL)
	if len(rows) != 1 || rows[0].ID != second.Participant || rows[0].State != "joined" || rows[0].Workroom != "ひよこ" || rows[0].Bird != "inko" || rows[0].Takeover != "" {
		t.Fatalf("after: %+v", rows)
	}
	// 新しい持ち主には MCP の返事で伝わる。元の持ち主の id は表に無いので断られた知らせ
	if _, h := call(t, "GET", s.URL+"/api/ai/books?projects=default", "", map[string]string{ParticipantHeader: second.Participant}); h.Get(NoticeHeader) == "" {
		t.Fatal("the new owner was not welcomed")
	}
	if _, h := call(t, "GET", s.URL+"/api/ai/books?projects=default", "", map[string]string{ParticipantHeader: first.Participant}); !strings.Contains(h.Get(NoticeHeader), "declined") {
		t.Fatalf("the old owner = %q", h.Get(NoticeHeader))
	}
	// 呼ばれて時間がたった（有効時間を過ぎた）参加者の名前も引き継げる
	hub.mu.Lock()
	n := hub.participantNotes[second.Participant]
	n.Called = "2020-01-01T00:00:00.000Z"
	hub.participantNotes[second.Participant] = n
	hub.mu.Unlock()
	again, _ := call(t, "POST", s.URL+"/api/ai/join", joinWith("L3", "", `,"workroom":"ひよこ"`), nil)
	if !strings.Contains(again, `"takeover":"ひよこ"`) {
		t.Fatalf("after a long quiet = %s", again)
	}
}
