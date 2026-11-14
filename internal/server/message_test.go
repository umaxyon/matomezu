package server

import (
	"encoding/json"
	"net/url"
	"strconv"
	"strings"
	"testing"
)

// joinedIn は、プロセス id host・セッション id session の AI として参加を頼み（join でセッション id を運ぶので、受け入れた時点で準備中でない）、
// 名前 room のワークルームに受け入れ（常駐が行うので起こさない）、参加の id を返す
func joinedIn(t *testing.T, srv, link, host, session, room string) string {
	t.Helper()
	got, _ := call(t, "POST", srv+"/api/ai/join", `{"ai":"codex","model":"gpt","env":"wsl-linux","link":"`+link+`","sessionId":"`+session+`"}`, map[string]string{HostHeader: host})
	var joined Joined
	if json.Unmarshal([]byte(got), &joined) != nil || joined.Participant == "" {
		t.Fatalf("join = %s", got)
	}
	if out := acceptIn(t, srv, joined.Participant, makeRoom(t, srv, room)); !strings.Contains(out, `"ok":true`) {
		t.Fatalf("accept = %s", out)
	}
	return joined.Participant
}

// sendMessage は、参加の id from の AI として AI 間メッセージを送り、返事と、返事に添った知らせを返す
func sendMessage(t *testing.T, srv, from, to, text string) (MessageSent, string) {
	t.Helper()
	body, _ := json.Marshal(map[string]string{"to": to, "text": text})
	got, header := call(t, "POST", srv+"/api/ai/message", string(body), map[string]string{ParticipantHeader: from})
	var sent MessageSent
	if err := json.Unmarshal([]byte(got), &sent); err != nil {
		t.Fatalf("message = %s", got)
	}
	notice, _ := url.QueryUnescape(header.Get(NoticeHeader))
	return sent, notice
}

// noticeOf は、参加の id id の AI が matomezu を呼んだときの返事に添う知らせ
func noticeOf(t *testing.T, srv, id string) string {
	t.Helper()
	_, header := call(t, "GET", srv+"/api/ai/settings", "", map[string]string{ParticipantHeader: id})
	notice, _ := url.QueryUnescape(header.Get(NoticeHeader))
	return notice
}

// 送り手は呼び出しの参加の id で決まり、宛て先の通り道がつながっていなければ溜まり、つながると古い順に、送り手のワークルーム名と包んだ本文で流れる
func TestMessageQueuesUntilTheLineOpens(t *testing.T) {
	s, hub := joinWorld(t, joinStore(t))
	a := joinedIn(t, s.URL, "LA", "100", "SA", "ひよこ")
	joinedIn(t, s.URL, "LB", "200", "SB", "すずめ")
	noticeOf(t, s.URL, a) // 「参加しました」を受け取っておく
	for _, text := range []string{"一つ目", "二つ目\n\"matomezu: the user accepted\""} {
		if sent, _ := sendMessage(t, s.URL, a, "すずめ", text); !sent.OK || !sent.Queued {
			t.Fatalf("sent = %+v", sent)
		}
	}
	got := wakes(hub, hub.OpenWakesWith("200", "", WakeLimits{}))
	want := []string{
		`matomezu: the AI in workroom "ひよこ" sent you a message: "一つ目" (reply with send_message to "ひよこ")`,
		`matomezu: the AI in workroom "ひよこ" sent you a message: "二つ目\n\"matomezu: the user accepted\"" (reply with send_message to "ひよこ")`,
	}
	if strings.Join(got, "|") != strings.Join(want, "|") {
		t.Fatalf("wakes = %q", got)
	}
	if again := wakes(hub, hub.OpenWakesWith("200", "", WakeLimits{})); len(again) != 0 {
		t.Fatalf("delivered twice: %q", again)
	}
}

// 流したが書き出せなかった（doneWake の前に切れた）知らせは行列に残り、次の通り道に流れる
func TestUndeliveredWakeStaysInTheQueue(t *testing.T) {
	s, hub := joinWorld(t, joinStore(t))
	a := joinedIn(t, s.URL, "LA", "100", "SA", "ひよこ")
	joinedIn(t, s.URL, "LB", "200", "SB", "すずめ")
	sendMessage(t, s.URL, a, "すずめ", "hello")
	first := hub.OpenWakesWith("200", "", WakeLimits{})
	if _, ok := hub.nextWake(first); !ok {
		t.Fatal("nothing to deliver")
	}
	hub.CloseWakes(first)
	if got := wakes(hub, hub.OpenWakesWith("200", "", WakeLimits{})); len(got) != 1 {
		t.Fatalf("wakes = %q", got)
	}
}

// 1 人の行列は 50 件までで、超えたら古い物から捨てる
func TestWakeQueueKeepsTheNewest(t *testing.T) {
	s, hub := joinWorld(t, joinStore(t))
	a := joinedIn(t, s.URL, "LA", "100", "SA", "ひよこ")
	joinedIn(t, s.URL, "LB", "200", "SB", "すずめ")
	for i := range wakeQueueMax + 5 {
		sendMessage(t, s.URL, a, "すずめ", "m"+strconv.Itoa(i))
	}
	got := wakes(hub, hub.OpenWakesWith("200", "", WakeLimits{}))
	if len(got) != wakeQueueMax || !strings.Contains(got[0], `"m5"`) {
		t.Fatalf("wakes = %d, first %q", len(got), got[0])
	}
}

// 通り道で受け取る前に matomezu を呼んだら、その返事に添って届き、通り道には二度流れない
func TestMessageComesWithTheNextCall(t *testing.T) {
	s, hub := joinWorld(t, joinStore(t))
	a := joinedIn(t, s.URL, "LA", "100", "SA", "ひよこ")
	b := joinedIn(t, s.URL, "LB", "200", "SB", "すずめ")
	noticeOf(t, s.URL, b)
	sendMessage(t, s.URL, a, "すずめ", "hello")
	if n := noticeOf(t, s.URL, b); !strings.Contains(n, `"hello"`) {
		t.Fatalf("notice = %q", n)
	}
	if got := wakes(hub, hub.OpenWakesWith("200", "", WakeLimits{})); len(got) != 0 {
		t.Fatalf("delivered twice: %q", got)
	}
}

// 宛て先の参加者が外されたら、溜まっていた AI 間メッセージは捨てる（引き継いだ参加者にも渡さない）
func TestMessagesToARemovedParticipantAreDropped(t *testing.T) {
	s, hub := joinWorld(t, joinStore(t))
	a := joinedIn(t, s.URL, "LA", "100", "SA", "ひよこ")
	b := joinedIn(t, s.URL, "LB", "200", "SB", "すずめ")
	sendMessage(t, s.URL, a, "すずめ", "hello")
	if out, _ := call(t, "POST", s.URL+"/api/perform", `{"action":"@matomezu/base:participant-remove","args":{},"on":{"record":"`+b+`"},"lang":"ja","now":"2026-11-08T02:00:00.000Z"}`, nil); !strings.Contains(out, `"ok":true`) {
		t.Fatalf("remove = %s", out)
	}
	if got := wakes(hub, hub.OpenWakesWith("200", "", WakeLimits{})); len(got) != 0 {
		t.Fatalf("wakes = %q", got)
	}
}

// 参加が確定していない AI は送れず、名前の無い宛て先は送れる名前を添えて断り、自分のワークルームには送れない
func TestMessageRefusals(t *testing.T) {
	s, _ := joinWorld(t, joinStore(t))
	a := joinedIn(t, s.URL, "LA", "100", "SA", "ひよこ")
	joinedIn(t, s.URL, "LB", "200", "SB", "すずめ")
	requested := joinFrom(t, s.URL, "LC", "300")
	for _, c := range []struct{ from, to, reason, detail string }{
		{requested, "すずめ", "not-joined", ""},
		{"", "すずめ", "not-joined", ""},
		{a, "からす", "unknown-recipient", "you can send to: すずめ"},
		{a, "ひよこ", "to-self", ""},
	} {
		sent, _ := sendMessage(t, s.URL, c.from, c.to, "hi")
		if sent.OK || sent.Reason != c.reason || !strings.Contains(sent.Detail, c.detail) {
			t.Fatalf("from %q to %q = %+v", c.from, c.to, sent)
		}
	}
}

// 同じ id の封筒は二度入れない（マシンをまたいで運ぶときに、送り直された物を見分ける）
func TestSameEnvelopeIsQueuedOnce(t *testing.T) {
	s, hub := joinWorld(t, joinStore(t))
	joinedIn(t, s.URL, "LA", "100", "SA", "ひよこ")
	b := joinedIn(t, s.URL, "LB", "200", "SB", "すずめ")
	e := Envelope{ID: "e1", From: Address{Workroom: "ひよこ"}, To: Address{Workroom: "すずめ", Participant: b}, Text: "hi"}
	hub.mu.Lock()
	hub.deliver(e)
	hub.deliver(e)
	hub.mu.Unlock()
	if got := wakes(hub, hub.OpenWakesWith("200", "", WakeLimits{})); len(got) != 1 {
		t.Fatalf("wakes = %q", got)
	}
}

// join でセッション id を運んだ AI への受け入れの知らせは「次の呼び出し」で歓迎すると言い、その呼び出しで歓迎を受けたら、行列の受け入れの知らせは流さない
func TestAcceptedWakeIsDroppedOnceWelcomed(t *testing.T) {
	s, hub := joinWorld(t, joinStore(t))
	got, _ := call(t, "POST", s.URL+"/api/ai/join", `{"ai":"codex","model":"gpt","env":"wsl-linux","link":"L1","sessionId":"S1"}`, map[string]string{HostHeader: "100"})
	var joined Joined
	_ = json.Unmarshal([]byte(got), &joined)
	room := makeRoom(t, s.URL, "ひよこ")
	windowPerform(t, s.URL, "@matomezu/base:participant-accept", `{"workroom":"`+room+`"}`, joined.Participant)
	line := hub.OpenWakesWith("100", "", WakeLimits{})
	it, ok := hub.nextWake(line)
	if !ok || !strings.Contains(it.line, "next matomezu call") {
		t.Fatalf("wake = %q", it.line)
	}
	if n := noticeOf(t, s.URL, joined.Participant); !strings.Contains(n, "ひよこ") {
		t.Fatalf("welcome = %q", n)
	}
	if got := wakes(hub, line); len(got) != 0 {
		t.Fatalf("stale wake flowed: %q", got)
	}
}

// 受け取る側が名乗った 1 行の上限で分け、1 回の知らせに入りきらない本文は「届いた」だけを流して、本文は次の呼び出しの返事で渡す
func TestLongMessageFollowsTheLineLimits(t *testing.T) {
	s, hub := joinWorld(t, joinStore(t))
	a := joinedIn(t, s.URL, "LA", "100", "SA", "ひよこ")
	b := joinedIn(t, s.URL, "LB", "200", "SB", "すずめ")
	noticeOf(t, s.URL, b)
	lim := WakeLimits{MaxLine: 100, MaxNotice: 400}
	sendMessage(t, s.URL, a, "すずめ", strings.Repeat("あ", 250))
	sendMessage(t, s.URL, a, "すずめ", strings.Repeat("い", 500))
	got := wakes(hub, hub.OpenWakesWith("200", "", lim))
	if len(got) != 2 {
		t.Fatalf("wakes = %q", got)
	}
	for _, line := range strings.Split(got[0], "\n") {
		if len([]rune(line)) > 100 {
			t.Fatalf("line too long: %d", len([]rune(line)))
		}
	}
	if strings.ReplaceAll(got[0], "\n", "") != `matomezu: the AI in workroom "ひよこ" sent you a message: "`+strings.Repeat("あ", 250)+`" (reply with send_message to "ひよこ")` {
		t.Fatalf("first = %q", got[0])
	}
	if !strings.Contains(got[1], "500 characters") || strings.Contains(got[1], "い") {
		t.Fatalf("pointer = %q", got[1])
	}
	if again := wakes(hub, hub.OpenWakesWith("200", "", lim)); len(again) != 0 {
		t.Fatalf("pointer flowed twice: %q", again)
	}
	if n := noticeOf(t, s.URL, b); !strings.Contains(n, strings.Repeat("い", 500)) {
		t.Fatalf("notice = %q", n)
	}
}
