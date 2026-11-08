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
