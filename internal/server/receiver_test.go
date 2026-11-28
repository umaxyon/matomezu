package server

import (
	"encoding/json"
	"fmt"
	"regexp"
	"slices"
	"strings"
	"testing"
	"time"

	"github.com/umaxyon/matomezu/internal/engine"
)

// receiverWorld は、テストの追加プラグイン ex16（かぞえを送り、レシーバーで受ける）を足して有効にし、ワークルーム「すずめ」に AI（ホスト 200）を入れた世界と、その参加者の id
func receiverWorld(t *testing.T) (*Hub, string) {
	hub, b, _ := receiverWorldOn(t)
	return hub, b
}

// receiverWorldOn は receiverWorld と、その常駐の URL
func receiverWorldOn(t *testing.T) (*Hub, string, string) {
	t.Helper()
	s, hub := joinWorld(t, joinStore(t))
	b := joinedIn(t, s.URL, "LB", "200", "SB", "すずめ")
	if _, err := hub.LinkPlugin("../../test/added-plugins/ex16"); err != nil {
		t.Fatal(err)
	}
	if out, err := hub.Perform(performOne("@matomezu/base:settings-set", json.RawMessage(`{"values":{"`+enabledPluginsSetting+`":["ex16"]}}`), nil)); err != nil || !out.OK {
		t.Fatalf("enable ex16 = %+v, %v", out, err)
	}
	return hub, b, s.URL
}

// fromWindow は、窓の利用者が ex16 のかぞえ（on が空なら作る）から payloads を送る頼み
func fromWindow(payloads string, on string) Perform {
	var target *engine.On
	if on != "" {
		target = &engine.On{Record: on}
	}
	p := performOne("ex16:tally-send", json.RawMessage(`{"payloads":`+payloads+`}`), target)
	p.Client = "window-1"
	return p
}

// tally は、かぞえ id の数と記録
func tally(t *testing.T, hub *Hub, id string) (int, []string) {
	t.Helper()
	records, _ := hub.Records()
	var got struct {
		Count int      `json:"count"`
		Log   []string `json:"log"`
	}
	if err := json.Unmarshal(records["ex16:tally"][id], &got); err != nil {
		t.Fatalf("tally %s = %s", id, records["ex16:tally"][id])
	}
	return got.Count, got.Log
}

// tallies は、ex16 のかぞえの id の全部
func tallies(hub *Hub) []string {
	records, _ := hub.Records()
	var ids []string
	for id := range records["ex16:tally"] {
		ids = append(ids, id)
	}
	return ids
}

// 窓の利用者が送った 1 通をレシーバーがその場で受け（on を省けば作る）、その run が送った AI 宛ては、利用者の頼みの印と返事の封筒の id を付けて届く。
// AI は send_message の replyTo で 1 回だけ返せ、返事はその AI を行う者に返事を受けるレシーバーへ届く（返事の元の封筒の id が ctx.received に載る）
func TestReceiverChain(t *testing.T) {
	t.Parallel()
	hub, b := receiverWorld(t)
	ask := `[{"to":{"workroom":"すずめ"},"text":"your move","replyReceiver":{"receiver":"ex16:tally-receive"}}]`
	out, err := hub.Perform(fromWindow(`[{"to":{"receiver":"ex16:tally-receive"},"id":"e1","args":{"n":2,"next":`+ask+`}}]`, ""))
	if err != nil || !out.OK {
		t.Fatalf("send = %+v, %v", out, err)
	}
	ids := tallies(hub)
	if len(ids) != 2 {
		t.Fatalf("tallies = %v", ids)
	}
	received := ""
	for _, id := range ids {
		if n, log := tally(t, hub, id); n == 2 && slices.Equal(log, []string{"user::e1:"}) {
			received = id
		}
	}
	if received == "" {
		t.Fatalf("no tally received the payload: %v", ids)
	}
	woke := wakes(hub, hub.OpenWakesWith("200", "", "", WakeLimits{}))
	line := regexp.MustCompile(`^matomezu from the user \(as your user's request\): "your move" \(replyTo "([^"]+)"\)$`)
	if len(woke) != 1 || !line.MatchString(woke[0]) {
		t.Fatalf("wakes = %q", woke)
	}
	envelope := line.FindStringSubmatch(woke[0])[1]
	sent, err := hub.SendMessage(MessageRequest{ReplyTo: envelope, Args: json.RawMessage(`{"n":5}`), Participant: b}, time.Now())
	if err != nil || !sent.OK || !strings.Contains(string(sent.Result), `"count":5`) {
		t.Fatalf("reply = %+v, %v", sent, err)
	}
	var reply struct {
		Tally string `json:"tally"`
	}
	_ = json.Unmarshal(sent.Result, &reply)
	if _, log := tally(t, hub, reply.Tally); len(log) != 1 || !strings.HasPrefix(log[0], "ai:すずめ:") || !strings.HasSuffix(log[0], ":"+envelope) {
		t.Fatalf("the reply's log = %q", log)
	}
	// 1 通への返事は 1 回だけ。ほかの参加者も、無い id にも返せない
	for _, req := range []MessageRequest{{ReplyTo: envelope, Participant: b}, {ReplyTo: "nothing", Participant: b}} {
		if again, _ := hub.SendMessage(req, time.Now()); again.OK || again.Reason != "no-reply-wait" {
			t.Fatalf("reply %+v = %+v", req, again)
		}
	}
}

// replyToOf は、届いた 1 行 line の返事の封筒の id（無ければ空）
func replyToOf(line string) string {
	if m := regexp.MustCompile(`\(replyTo "([^"]+)"\)$`).FindStringSubmatch(line); m != nil {
		return m[1]
	}
	return ""
}

// AI とレシーバーの往復は止めない: 返事を受けたレシーバーが、返した AI 自身にまた返事を求めても届き、AI はまた返せる。
// AI の返事から始まった鎖なので、届く行に利用者の頼みの印は付かない
func TestReceiverRoundTrips(t *testing.T) {
	t.Parallel()
	hub, b := receiverWorld(t)
	ask := `[{"to":{"workroom":"すずめ"},"text":"your move","replyReceiver":{"receiver":"ex16:tally-receive"}}]`
	if out, err := hub.Perform(fromWindow(ask, "")); err != nil || !out.OK {
		t.Fatalf("send = %+v, %v", out, err)
	}
	line := hub.OpenWakesWith("200", "", "", WakeLimits{})
	woke := wakes(hub, line)
	for round := range rallyLocalLimit + 2 {
		if len(woke) != 1 || replyToOf(woke[0]) == "" {
			t.Fatalf("round %d: wakes = %q", round, woke)
		}
		if round > 0 && !strings.HasPrefix(woke[0], `matomezu from AI "すずめ": "again"`) {
			t.Fatalf("round %d: the line from the receiver = %q", round, woke[0])
		}
		again := `[{"to":{"workroom":"すずめ"},"text":"again","replyReceiver":{"receiver":"ex16:tally-receive"}}]`
		if sent, err := hub.SendMessage(MessageRequest{ReplyTo: replyToOf(woke[0]), Args: json.RawMessage(`{"n":1,"next":` + again + `}`), Participant: b}, time.Now()); err != nil || !sent.OK {
			t.Fatalf("round %d: reply = %+v, %v", round, sent, err)
		}
		woke = wakes(hub, line)
	}
}

// レシーバーが断った返事は、覚えを戻すので、もう一度返せる。参加していない者は返せず、受けた参加者が退室すれば忘れる
func TestRefusedReplyCanBeSentAgain(t *testing.T) {
	t.Parallel()
	hub, b := receiverWorld(t)
	ask := `[{"to":{"workroom":"すずめ"},"text":"your move","replyReceiver":{"receiver":"ex16:tally-receive"}}]`
	if out, err := hub.Perform(fromWindow(ask, "")); err != nil || !out.OK {
		t.Fatalf("send = %+v, %v", out, err)
	}
	woke := wakes(hub, hub.OpenWakesWith("200", "", "", WakeLimits{}))
	envelope := regexp.MustCompile(`replyTo "([^"]+)"`).FindStringSubmatch(strings.Join(woke, "\n"))
	if envelope == nil {
		t.Fatalf("wakes = %q", woke)
	}
	if sent, _ := hub.SendMessage(MessageRequest{ReplyTo: envelope[1], Args: json.RawMessage(`{"n":1}`), Participant: "someone"}, time.Now()); sent.OK || sent.Reason != "not-joined" {
		t.Fatalf("a reply from someone not joined = %+v", sent)
	}
	if sent, _ := hub.SendMessage(MessageRequest{ReplyTo: envelope[1], Args: json.RawMessage(`{"n":-1}`), Participant: b}, time.Now()); sent.OK || sent.Reason != "refused" {
		t.Fatalf("a refused reply = %+v", sent)
	}
	if sent, _ := hub.SendMessage(MessageRequest{ReplyTo: envelope[1], Args: json.RawMessage(`{"n":1}`), Participant: b}, time.Now()); !sent.OK {
		t.Fatalf("the reply again = %+v", sent)
	}
	if out, err := hub.Perform(fromWindow(ask, "")); err != nil || !out.OK {
		t.Fatalf("send again = %+v, %v", out, err)
	}
	if out, err := hub.Perform(performOne("@matomezu/base:participant-remove", json.RawMessage(`{}`), &engine.On{Record: b})); err != nil || !out.OK {
		t.Fatalf("remove = %+v, %v", out, err)
	}
	hub.mu.Lock()
	left := len(hub.replies) + len(hub.replyOrder)
	hub.mu.Unlock()
	if left != 0 {
		t.Fatalf("replies after the recipient left = %d", left)
	}
}

// 同じ封筒の id の 1 通は二度行わない。レシーバーが断ったら、届かなかった結果の先を送り手と同じ者で行う
func TestReceiverOnceAndUndelivered(t *testing.T) {
	t.Parallel()
	hub, _ := receiverWorld(t)
	if out, err := hub.Perform(fromWindow(`[]`, "")); err != nil || !out.OK {
		t.Fatalf("make a tally = %+v, %v", out, err)
	}
	id := tallies(hub)[0]
	twice := fmt.Sprintf(`[{"to":{"receiver":"ex16:tally-receive","on":%q},"id":"dup","args":{"n":1}},{"to":{"receiver":"ex16:tally-receive","on":%q},"id":"dup","args":{"n":1}}]`, id, id)
	if out, err := hub.Perform(fromWindow(twice, id)); err != nil || !out.OK {
		t.Fatalf("send twice = %+v, %v", out, err)
	}
	if n, _ := tally(t, hub, id); n != 1 {
		t.Fatalf("count after the same envelope twice = %d", n)
	}
	refused := fmt.Sprintf(`[{"to":{"receiver":"ex16:tally-receive","on":%q},"id":"neg","args":{"n":-1},"undelivered":{"receiver":"ex16:tally-undelivered","on":%q}}]`, id, id)
	if out, err := hub.Perform(fromWindow(refused, id)); err != nil || !out.OK {
		t.Fatalf("send a refused one = %+v, %v", out, err)
	}
	if n, log := tally(t, hub, id); n != 1 || !slices.Contains(log, "undelivered:neg:refused") {
		t.Fatalf("after an undelivered one = %d %q", n, log)
	}
}

// 人も AI も挟まずにレシーバーからレシーバーへ続く段は hopLimit まで。超える 1 通は、noRecipient が skip なら送らない
func TestReceiverHopLimit(t *testing.T) {
	t.Parallel()
	hub, _ := receiverWorld(t)
	if out, err := hub.Perform(fromWindow(`[]`, "")); err != nil || !out.OK {
		t.Fatalf("make a tally = %+v, %v", out, err)
	}
	id := tallies(hub)[0]
	next := `[]`
	for i := hopLimit + 5; i >= 0; i-- {
		next = fmt.Sprintf(`[{"to":{"receiver":"ex16:tally-receive","on":%q},"id":"h%d","args":{"n":1,"next":%s},"noRecipient":"skip"}]`, id, i, next)
	}
	if out, err := hub.Perform(fromWindow(next, id)); err != nil || !out.OK {
		t.Fatalf("send = %+v, %v", out, err)
	}
	if n, _ := tally(t, hub, id); n != hopLimit+1 {
		t.Fatalf("count = %d; want %d", n, hopLimit+1)
	}
	// 1 つの頼みから広がるレシーバーの数の合計は receivesMax まで（skip でなければバルクを断る）
	wide := make([]string, receivesMax+1)
	for i := range wide {
		wide[i] = fmt.Sprintf(`{"to":{"receiver":"ex16:tally-receive","on":%q},"id":"w%d","args":{"n":1},"noRecipient":"skip"}`, id, i)
	}
	if out, err := hub.Perform(fromWindow("["+strings.Join(wide, ",")+"]", id)); err != nil || !out.OK {
		t.Fatalf("send wide = %+v, %v", out, err)
	}
	if n, _ := tally(t, hub, id); n != hopLimit+1+receivesMax {
		t.Fatalf("count after wide = %d; want %d", n, hopLimit+1+receivesMax)
	}
	strict := strings.ReplaceAll("["+strings.Join(wide, ",")+"]", `,"noRecipient":"skip"`, "")
	strict = strings.ReplaceAll(strict, `"id":"w`, `"id":"s`)
	if out, _ := hub.Perform(fromWindow(strict, id)); out.OK || out.Reason != "hop-limit" {
		t.Fatalf("send wide without skip = %+v", out)
	}
}

// レシーバーを挟んだ AI どうしの往復は、行った AI からほかの AI への向きで AI ラリーに数える（上限を超えた返事は断り、もう一度返せる）
func TestReceiverBetweenAIsIsRallied(t *testing.T) {
	t.Parallel()
	hub, a, srv := receiverWorldOn(t)
	b := joinedIn(t, srv, "LC", "300", "SC", "ひばり")
	ask := func(room string) string {
		return `[{"to":{"workroom":"` + room + `"},"text":"your move","replyReceiver":{"receiver":"ex16:tally-receive"}}]`
	}
	if out, err := hub.Perform(fromWindow(ask("すずめ"), "")); err != nil || !out.OK {
		t.Fatalf("send = %+v, %v", out, err)
	}
	lines := map[string]*wakeLine{a: hub.OpenWakesWith("200", "", "", WakeLimits{}), b: hub.OpenWakesWith("300", "", "", WakeLimits{})}
	who, other := a, b
	room := map[string]string{a: "すずめ", b: "ひばり"}
	for round := range 2*rallyLocalLimit + 2 {
		woke := wakes(hub, lines[who])
		if len(woke) != 1 || replyToOf(woke[0]) == "" {
			t.Fatalf("round %d: wakes = %q", round, woke)
		}
		sent, err := hub.SendMessage(MessageRequest{ReplyTo: replyToOf(woke[0]), Args: json.RawMessage(`{"n":1,"next":` + ask(room[other]) + `}`), Participant: who}, time.Now())
		if err != nil {
			t.Fatal(err)
		}
		if !sent.OK {
			if sent.Reason != "rally-limit" {
				t.Fatalf("round %d: reply = %+v", round, sent)
			}
			return
		}
		who, other = other, who
	}
	t.Fatalf("the AIs went on past the rally limit %d", rallyLocalLimit)
}

// レシーバーは届いた 1 通からだけ行う。送り先・返事・届かなかった結果の先は、その印を持つレシーバーでなければバルクごと断る
func TestReceiverRefusals(t *testing.T) {
	t.Parallel()
	hub, b := receiverWorld(t)
	direct := performOne("ex16:tally-receive", json.RawMessage(`{"n":1}`), nil)
	direct.By, direct.Participant = "ai", b
	if out, _ := hub.Perform(direct); out.OK || !strings.Contains(out.Detail, "only receives payloads") {
		t.Fatalf("perform a receiver directly = %+v", out)
	}
	for _, payloads := range []string{
		`[{"to":{"receiver":"ex16:tally-send"},"id":"x","args":{"payloads":[]}}]`,
		`[{"to":{"receiver":"ex16:tally-receive"},"id":"x","args":{"n":1},"undelivered":{"receiver":"ex16:tally-receive"}}]`,
		`[{"to":{"workroom":"すずめ"},"text":"t","replyReceiver":{"receiver":"ex16:tally-undelivered"}}]`,
		`[{"to":{"receiver":"ex16:nothing"},"id":"x","args":{}}]`,
	} {
		if out, _ := hub.Perform(fromWindow(payloads, "")); out.OK || !strings.Contains(out.Detail, "not an action that receives") {
			t.Fatalf("%s = %+v", payloads, out)
		}
	}
	if out, _ := hub.Perform(fromWindow(`[{"to":{"receiver":"ex16:tally-receive"},"id":"","args":{"n":1}}]`, "")); out.OK || !strings.Contains(out.Detail, "has no id") {
		t.Fatalf("a payload without an id = %+v", out)
	}
	if ids := tallies(hub); len(ids) != 0 {
		t.Fatalf("tallies after the refusals = %v", ids)
	}
	// AI の actions には、返事を受けるレシーバーを receives と出し、届かなかった結果を受けるレシーバーは出さない
	catalog := string(hub.AICatalog([]string{"ex16:tally-receive", "ex16:tally-undelivered"}))
	if !strings.Contains(catalog, `"receives":"messages"`) || !strings.Contains(catalog, `"unknown":["ex16:tally-undelivered"]`) {
		t.Fatalf("the AI's actions = %s", catalog)
	}
}
