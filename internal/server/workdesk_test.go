package server

import (
	"encoding/json"
	"strings"
	"testing"

	"github.com/umaxyon/matomezu/internal/aiwire"
)

// AI の作業机の読み: ワーカーブックがまだ無ければ空、ページを足すとそのブック（応えを待つ付箋の数も）。ワークルームのフォルダはその作業机を出す。
// 参加していない AI は断る（エラーにしない）。待つ物の一覧は、話しかけた会話のセッションの AI のワーカーブックの付箋も出す
func TestTheAIReadsItsWorkdesk(t *testing.T) {
	s, hub := joinWorld(t, joinStore(t))
	a := joinedIn(t, s.URL, "LA", "100", "SA", "ひよこ")
	noticeOf(t, s.URL, a)
	as := map[string]string{aiwire.ParticipantHeader: a}
	type entry struct {
		Kind, ID, Title string
		Awaiting        int
	}
	type folder struct {
		ID, Kind, Title string
		Path            []struct{ ID, Title, SystemFolder string }
		Lineup          []entry
		Refused         string
	}
	read := func(id string, header map[string]string) folder {
		t.Helper()
		got, _ := call(t, "GET", s.URL+"/api/ai/folder?folder="+id, "", header)
		var f folder
		if err := json.Unmarshal([]byte(got), &f); err != nil {
			t.Fatalf("folder %s = %s", id, got)
		}
		return f
	}

	empty := read(myWorkdeskFolder, as)
	if empty.ID != myWorkdeskFolder || empty.Kind != kindWorkdesk || empty.Title != "ひよこ" || len(empty.Lineup) != 0 ||
		len(empty.Path) != 3 || empty.Path[1].SystemFolder != "@matomezu/base:workrooms" || empty.Path[2].ID != myWorkdeskFolder {
		t.Fatalf("workdesk without a worker book = %+v", empty)
	}
	if rooms := read(empty.Path[1].ID, as); len(rooms.Lineup) != 1 || rooms.Lineup[0] != (entry{Kind: kindWorkdesk, ID: myWorkdeskFolder, Title: "ひよこ"}) {
		t.Fatalf("workrooms folder = %+v", rooms)
	}
	if other := read(empty.Path[1].ID, nil); len(other.Lineup) != 0 {
		t.Fatalf("workrooms folder for an AI that has not joined = %+v", other)
	}
	if refused := read(myWorkdeskFolder, nil); !strings.HasPrefix(refused.Refused, "not-joined:") {
		t.Fatalf("workdesk for an AI that has not joined = %+v", refused)
	}

	got, _ := call(t, "POST", s.URL+"/api/ai/perform", `{"action":"@matomezu/base:worker-page-add","args":{"type":"@matomezu/tree:tree","title":"memo","fields":{"root":{"caption":"r"}}}}`, as)
	var added struct {
		OK     bool
		Result struct {
			Book, Page string
			Fields     struct{ Root struct{ ID string } }
		}
	}
	if json.Unmarshal([]byte(got), &added) != nil || !added.OK || added.Result.Book == "" || added.Result.Fields.Root.ID == "" {
		t.Fatalf("worker-page-add = %s", got)
	}
	postPerform(t, s.URL, `{"action":"@matomezu/base:note-add","args":{"anchors":["`+added.Result.Fields.Root.ID+`"],"text":"x"},"on":{"page":"`+added.Result.Page+`"},"lang":"ja","ids":["c1"],"now":"2026-11-02T00:00:00.000Z"}`)
	desk := read(myWorkdeskFolder, as)
	if len(desk.Lineup) != 1 || desk.Lineup[0].Kind != "book" || desk.Lineup[0].ID != added.Result.Book || desk.Lineup[0].Title != "ひよこ" || desk.Lineup[0].Awaiting != 1 {
		t.Fatalf("workdesk with a worker book = %+v", desk)
	}

	var awaiting struct {
		Awaiting []struct{ Entry stageEntry }
	}
	for session, want := range map[string]int{"SA": 1, "": 0} {
		got, _ := call(t, "GET", s.URL+"/api/ai/awaiting?session="+session, "", nil)
		if json.Unmarshal([]byte(got), &awaiting) != nil || len(awaiting.Awaiting) != want || (want == 1 && awaiting.Awaiting[0].Entry.ID != added.Result.Book) {
			t.Fatalf("awaiting for the session %q = %s", session, got)
		}
	}

	records, err := hub.records()
	if err != nil {
		t.Fatal(err)
	}
	for _, r := range records {
		if r.ID != a {
			continue
		}
		hub.mu.Lock()
		text := hub.joinedTextHeld(r, nil)
		hub.mu.Unlock()
		if !strings.Contains(text, "Your worker book (the book of your current work) is "+added.Result.Book+", with 1 page: read it with read_book.") {
			t.Fatalf("joined text = %q", text)
		}
	}
}
