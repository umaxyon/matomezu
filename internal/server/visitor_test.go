package server

import (
	"encoding/json"
	"strings"
	"testing"
	"time"

	"github.com/umaxyon/matomezu/internal/aiwire"
)

// ビジター: as visitor で頼み、窓でビジターとして受け入れると、起こす知らせはビジターと言い、フックの参加の知らせはワークルームの名前を持たずに（利用者の言語の文も、ビジターの文）
// ビジターの文を添える。参加が確定したビジターは、AI 間メッセージも show も画像を置くのも断られ（理由 visitor）、アクションは core が断る（理由 visitor）
func TestVisitorIsToldAndOnlyReads(t *testing.T) {
	t.Parallel()
	s, hub := joinWorld(t, joinStore(t))
	line := hub.OpenWakesWith("300", "", WakeLimits{})
	got, _ := call(t, "POST", s.URL+"/api/ai/join", `{"ai":"claude","model":"opus","env":"wsl-linux","link":"LV","as":"visitor"}`, map[string]string{aiwire.HostHeader: "300"})
	var joined Joined
	if json.Unmarshal([]byte(got), &joined) != nil || joined.Participant == "" {
		t.Fatalf("join = %s", got)
	}
	if out := windowPerform(t, s.URL, "@matomezu/base:participant-accept", `{"as":"visitor"}`, joined.Participant); !strings.Contains(out, `"ok":true`) {
		t.Fatalf("accept = %s", out)
	}
	if w := wakes(hub, line); len(w) != 1 || !strings.Contains(w[0], "as a visitor") {
		t.Fatalf("wakes = %q", w)
	}
	// 準備中のビジターは、まだビジターと数えない（AI 間メッセージは not-joined）
	if sent, _ := sendMessage(t, s.URL, joined.Participant, "どこか", "x"); sent.Reason != "not-joined" {
		t.Fatalf("message while preparing = %+v", sent)
	}
	out, _ := call(t, "POST", s.URL+"/api/ai/talked", `{"sessionId":"SV","candidates":["LV"]}`, nil)
	var talk SessionTalk
	if err := json.Unmarshal([]byte(out), &talk); err != nil || len(talk.Welcomes) != 1 {
		t.Fatalf("talked = %s", out)
	}
	w := talk.Welcomes[0]
	if w.As != "visitor" || w.Workroom != "" || w.ForAI != visitorJoinedText || (!strings.Contains(w.Message, "visitor") && !strings.Contains(w.Message, "ビジター")) {
		t.Fatalf("welcome = %+v", w)
	}
	if hub.ParticipantCalls()[joined.Participant] == "" {
		t.Fatal("the visitor's welcome did not set the last called time")
	}
	if sent, _ := sendMessage(t, s.URL, joined.Participant, "どこか", "x"); sent.Reason != "visitor" {
		t.Fatalf("message = %+v", sent)
	}
	visitor := map[string]string{aiwire.ParticipantHeader: joined.Participant}
	if got, _ := call(t, "POST", s.URL+"/api/ai/show", `{"book":"b1"}`, visitor); !strings.Contains(got, `"reason":"visitor"`) {
		t.Fatalf("show = %s", got)
	}
	if got, _ := call(t, "POST", s.URL+"/api/ai/assets", `<svg xmlns="http://www.w3.org/2000/svg" width="8" height="4"/>`, visitor); !strings.Contains(got, `"reason":"visitor"`) {
		t.Fatalf("assets = %s", got)
	}
	if got, _ := call(t, "POST", s.URL+"/api/ai/perform", `{"action":"@matomezu/base:book-create","args":{"title":"x"}}`, visitor); !strings.Contains(got, `"detail":"visitor:`) {
		t.Fatalf("perform = %s", got)
	}
	if got, _ := call(t, "GET", s.URL+"/api/ai/folder?folder="+myWorkdeskFolder, "", visitor); !strings.Contains(got, `"refused":"visitor:`) {
		t.Fatalf("workdesk = %s", got)
	}
}

// as visitor と workroom を一緒に頼むと、ワークルームを見回らずに要求のアクションが断る（ワークルームに生きた参加者がいても workroom-in-use にならず、誰も外れない）
func TestVisitorWithAWorkroomIsRefusedByTheRequest(t *testing.T) {
	t.Parallel()
	s, _ := joinWorld(t, joinStore(t))
	a := joinedIn(t, s.URL, "LA", "100", "SA", "ひよこ")
	noticeOf(t, s.URL, a)
	got, _ := call(t, "POST", s.URL+"/api/ai/join", `{"ai":"claude","model":"opus","env":"wsl-linux","link":"LV","as":"visitor","workroom":"ひよこ"}`, nil)
	if strings.Contains(got, "workroom-in-use") || !strings.Contains(got, `"ok":false`) || !strings.Contains(got, "visitor has no workroom") {
		t.Fatalf("join = %s", got)
	}
	if rows := recordsOf(t, s.URL, "@matomezu/base:participant"); len(rows) != 1 || rows[a] == nil {
		t.Fatalf("participants = %v", rows)
	}
}

// ビジターは、最後に呼ばれてから（呼ばれていなければ受け入れてから）VisitorIdle の間呼ばれなければ退室させる。ワーカーは時間では外さない
func TestIdleVisitorsLeave(t *testing.T) {
	t.Parallel()
	s, hub := joinWorld(t, joinStore(t))
	worker := joinedIn(t, s.URL, "LA", "100", "SA", "ひよこ")
	got, _ := call(t, "POST", s.URL+"/api/ai/join", `{"ai":"claude","model":"opus","env":"wsl-linux","link":"LV","sessionId":"SV","as":"visitor"}`, nil)
	var joined Joined
	if json.Unmarshal([]byte(got), &joined) != nil || joined.Participant == "" {
		t.Fatalf("join = %s", got)
	}
	if out := windowPerform(t, s.URL, "@matomezu/base:participant-accept", `{"as":"visitor"}`, joined.Participant); !strings.Contains(out, `"ok":true`) {
		t.Fatalf("accept = %s", out)
	}
	noticeOf(t, s.URL, joined.Participant) // 呼ばれた時刻が残る
	called := hub.ParticipantCalls()[joined.Participant]
	at, err := time.Parse(time.RFC3339Nano, called)
	if err != nil {
		t.Fatalf("called = %q", called)
	}
	if err := hub.SweepParticipants(at.Add(VisitorIdle - time.Second)); err != nil {
		t.Fatal(err)
	}
	if rows := recordsOf(t, s.URL, "@matomezu/base:participant"); rows[joined.Participant] == nil {
		t.Fatal("a visitor called just now left")
	}
	if err := hub.SweepParticipants(at.Add(VisitorIdle + time.Hour)); err != nil {
		t.Fatal(err)
	}
	rows := recordsOf(t, s.URL, "@matomezu/base:participant")
	if rows[joined.Participant] != nil || rows[worker] == nil {
		t.Fatalf("participants after the visitors' idle time = %v", rows)
	}
}

// show は、参加が確定してワークルームに入っている AI だけ。参加者の id が無い AI は not-joined で断る
func TestShowNeedsAJoinedWorker(t *testing.T) {
	t.Parallel()
	s, _ := joinWorld(t, joinStore(t))
	if got, _ := call(t, "POST", s.URL+"/api/ai/show", `{"book":"b1"}`, nil); !strings.Contains(got, `"reason":"not-joined"`) {
		t.Fatalf("show without joining = %s", got)
	}
	a := joinedIn(t, s.URL, "LA", "100", "SA", "ひよこ")
	noticeOf(t, s.URL, a)
	if got, _ := call(t, "POST", s.URL+"/api/ai/show", `{"book":"b1"}`, map[string]string{aiwire.ParticipantHeader: a}); strings.Contains(got, "not-joined") {
		t.Fatalf("show by a joined worker = %s", got)
	}
}
