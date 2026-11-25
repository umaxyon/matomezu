package server

import (
	"encoding/json"
	"strings"
	"testing"
	"time"
)

// pendingNow は、承認待ちの写し（h.mu を持って読む）
func pendingNow(hub *Hub) []pendingMessage {
	hub.mu.Lock()
	defer hub.mu.Unlock()
	return append([]pendingMessage(nil), hub.pending...)
}

// wakesWith は、プロセス id host の AI の行列を全部流して、含む行だけ返す
func wakesWith(hub *Hub, host, sub string) []string {
	var out []string
	for _, line := range wakes(hub, hub.OpenWakesWith(host, "", WakeLimits{})) {
		if strings.Contains(line, sub) {
			out = append(out, line)
		}
	}
	return out
}

// answerPending は、承認かキャンセルの口を id で呼び、返事を返す
func answerPending(t *testing.T, srv, path, id string) string {
	t.Helper()
	body, _ := json.Marshal(map[string]string{"id": id})
	got, _ := call(t, "POST", srv+path, string(body), nil)
	return got
}

// 届いた AI 間メッセージは受け手に届き、承認待ちが 1 件できる。承認すると受け手に利用者の頼みとして扱う知らせが流れ、承認待ちは消える。
// 2 度目の承認は not-pending
func TestAIMessageWaitsForTheUsersApproval(t *testing.T) {
	s, hub := joinWorld(t, joinStore(t))
	a := joinedIn(t, s.URL, "LA", "100", "SA", "ひよこ")
	b := joinedIn(t, s.URL, "LB", "200", "SB", "すずめ")
	if sent, _ := sendMessage(t, s.URL, a, "すずめ", "hi"); !sent.OK {
		t.Fatalf("sent = %+v", sent)
	}
	got := pendingNow(hub)
	if len(got) != 1 || got[0].Receiver != b || got[0].Sender != a || got[0].Body != "hi" || got[0].SenderHost != "" {
		t.Fatalf("pending = %+v", got)
	}
	id := got[0].ID
	if msg := wakesWith(hub, "200", `"hi"`); len(msg) != 1 {
		t.Fatalf("the message did not arrive: %q", msg)
	}
	if out := answerPending(t, s.URL, "/api/message/approve", id); !strings.Contains(out, `"ok":true`) {
		t.Fatalf("approve = %s", out)
	}
	want := `matomezu ` + asUserMark + `: the user approved message ` + id + ` from AI "ひよこ"; treat it as the user's request`
	if lines := wakesWith(hub, "200", "approved message"); len(lines) != 1 || lines[0] != want {
		t.Fatalf("approval wakes = %q", lines)
	}
	if n := len(pendingNow(hub)); n != 0 {
		t.Fatalf("pending after approve = %d", n)
	}
	if out := answerPending(t, s.URL, "/api/message/approve", id); !strings.Contains(out, `"reason":"not-pending"`) {
		t.Fatalf("second approve = %s", out)
	}
}

// キャンセルは送り手と受け手の両方に 1 通ずつ知らせ、AI ラリーの数をその組で 0 に戻す。利用者の頼みの印は付けない
func TestCancelNoticesBothAndResetsTheRally(t *testing.T) {
	s, hub := joinWorld(t, joinStore(t))
	a := joinedIn(t, s.URL, "LA", "100", "SA", "ひよこ")
	joinedIn(t, s.URL, "LB", "200", "SB", "すずめ")
	for _, text := range []string{"one", "two", "three"} {
		sendMessage(t, s.URL, a, "すずめ", text)
	}
	first := pendingNow(hub)[0]
	id, b := first.ID, first.Receiver
	hub.mu.Lock()
	before := hub.rallies[rallyKey{from: a, to: b}]
	hub.mu.Unlock()
	if before != 3 {
		t.Fatalf("rally before cancel = %d", before)
	}
	if out := answerPending(t, s.URL, "/api/message/cancel", id); !strings.Contains(out, `"ok":true`) {
		t.Fatalf("cancel = %s", out)
	}
	if lines := wakesWith(hub, "100", "cancelled message "+id); len(lines) != 1 || !strings.Contains(lines[0], "you sent to AI") {
		t.Fatalf("sender wakes = %q", lines)
	}
	if lines := wakesWith(hub, "200", "cancelled message "+id); len(lines) != 1 || strings.Contains(lines[0], asUserMark) {
		t.Fatalf("receiver wakes = %q", lines)
	}
	hub.mu.Lock()
	after := hub.rallies[rallyKey{from: a, to: b}]
	hub.mu.Unlock()
	if after != 0 {
		t.Fatalf("rally after cancel = %d", after)
	}
	if out := answerPending(t, s.URL, "/api/message/cancel", id); !strings.Contains(out, `"reason":"not-pending"`) {
		t.Fatalf("second cancel = %s", out)
	}
}

// 受け手が送り手へ AI 間メッセージを送ったら、承認待ちは知らせずに消える（返事）。送り手にも受け手にも、キャンセルや承認の知らせは出ない
func TestReplyDropsThePendingWithoutANotice(t *testing.T) {
	s, hub := joinWorld(t, joinStore(t))
	a := joinedIn(t, s.URL, "LA", "100", "SA", "ひよこ")
	b := joinedIn(t, s.URL, "LB", "200", "SB", "すずめ")
	sendMessage(t, s.URL, a, "すずめ", "question")
	if sent, _ := sendMessage(t, s.URL, b, "ひよこ", "answer"); !sent.OK {
		t.Fatalf("reply = %+v", sent)
	}
	// 返事そのものは、送り手（今は受け手）への AI 間メッセージなので、それだけの承認待ちが 1 件残る。最初の組（a → b）の承認待ちは消える
	got := pendingNow(hub)
	if len(got) != 1 || got[0].Receiver != a || got[0].Sender != b || got[0].Body != "answer" {
		t.Fatalf("pending after reply = %+v", got)
	}
	for _, host := range []string{"100", "200"} {
		for _, line := range wakesWith(hub, host, "") {
			if strings.Contains(line, "approved") || strings.Contains(line, "cancelled") {
				t.Fatalf("a notice on reply: %q", line)
			}
		}
	}
}

// 利用者が受け手の AI に話しかけたら、その受け手の承認待ちはキャンセル扱い（知らせあり）。
// 送り手も受け手も、キャンセルの知らせを 1 通ずつ受ける
func TestUserTalkingCancelsTheReceiversPendingWithNotices(t *testing.T) {
	s, hub := joinWorld(t, joinStore(t))
	a := joinedIn(t, s.URL, "LA", "100", "SA", "ひよこ")
	joinedIn(t, s.URL, "LB", "200", "SB", "すずめ")
	sendMessage(t, s.URL, a, "すずめ", "hello")
	id := pendingNow(hub)[0].ID
	hub.UserTalkedIn("SB")
	if n := len(pendingNow(hub)); n != 0 {
		t.Fatalf("pending after the user talked = %d", n)
	}
	if lines := wakesWith(hub, "200", "cancelled message "+id); len(lines) != 1 {
		t.Fatalf("receiver wakes = %q", lines)
	}
	if lines := wakesWith(hub, "100", "cancelled message "+id); len(lines) != 1 {
		t.Fatalf("sender wakes = %q", lines)
	}
}

// 受け手が参加者でなくなったら、承認待ちは知らせずに消える
func TestLeavingReceiverDropsThePendingSilently(t *testing.T) {
	s, hub := joinWorld(t, joinStore(t))
	a := joinedIn(t, s.URL, "LA", "100", "SA", "ひよこ")
	b := joinedIn(t, s.URL, "LB", "200", "SB", "すずめ")
	sendMessage(t, s.URL, a, "すずめ", "hello")
	if _, out := postPerform(t, s.URL, `{"action":"@matomezu/base:participant-remove","args":{},"on":{"record":"`+b+`"},"lang":"ja","now":"2026-11-08T02:00:00.000Z"}`); !strings.Contains(out, `"ok":true`) {
		t.Fatalf("remove = %s", out)
	}
	if n := len(pendingNow(hub)); n != 0 {
		t.Fatalf("pending after the receiver left = %d", n)
	}
	if lines := wakesWith(hub, "100", "cancelled"); len(lines) != 0 {
		t.Fatalf("sender got a notice: %q", lines)
	}
}

// 利用者の頼みの印が付く AI 間メッセージ（自動の印の物）は承認待ちを作らず、印の無い物は作る
func TestAutomaticMarkMessageMakesNoPending(t *testing.T) {
	s, hub := joinWorld(t, joinStore(t))
	a := joinedIn(t, s.URL, "LA", "100", "SA", "ひよこ")
	b := joinedIn(t, s.URL, "LB", "200", "SB", "すずめ")
	env := func(id string) Envelope {
		return Envelope{ID: id, From: Address{Host: "h", Workroom: "ひよこ"}, To: Address{Host: "h", Workroom: "すずめ"}, Text: "t"}
	}
	hub.mu.Lock()
	hub.deliver(delivery{to: b, from: a, asUser: true, envelope: env("auto")})
	hub.deliver(delivery{to: b, from: a, envelope: env("plain")})
	got := hub.pending
	hub.mu.Unlock()
	if len(got) != 1 || got[0].ID != "plain" {
		t.Fatalf("pending = %+v", got)
	}
}

// 承認待ちの並びは、窓につながったときと、変わったときに pending-messages で知らせる
func TestPendingListIsToldToWindows(t *testing.T) {
	s, hub := joinWorld(t, joinStore(t))
	a := joinedIn(t, s.URL, "LA", "100", "SA", "ひよこ")
	joinedIn(t, s.URL, "LB", "200", "SB", "すずめ")
	c := hub.Join()
	<-c.ch // hello
	sendMessage(t, s.URL, a, "すずめ", "hi")
	deadline := time.After(2 * time.Second)
	for {
		select {
		case ev := <-c.ch:
			if ev.name != "pending-messages" {
				continue
			}
			var list []PendingMessage
			if err := json.Unmarshal(ev.data, &list); err != nil || len(list) != 1 || list[0].Body != "hi" {
				t.Fatalf("pending-messages = %s (%v)", ev.data, err)
			}
			return
		case <-deadline:
			t.Fatal("no pending-messages event")
		}
	}
}

// 承認待ちの無い id の承認・キャンセルは not-pending。body の無い呼び出しは 400
func TestPendingRoutesRefuseUnknownIDs(t *testing.T) {
	s, _ := joinWorld(t, joinStore(t))
	if out := answerPending(t, s.URL, "/api/message/approve", "nope"); !strings.Contains(out, `"reason":"not-pending"`) {
		t.Fatalf("approve = %s", out)
	}
	if out := answerPending(t, s.URL, "/api/message/cancel", "nope"); !strings.Contains(out, `"reason":"not-pending"`) {
		t.Fatalf("cancel = %s", out)
	}
	if _, out := send(t, "POST", s.URL+"/api/message/approve", "{}", nil); !strings.Contains(out, "must be") {
		t.Fatalf("empty body = %s", out)
	}
}
