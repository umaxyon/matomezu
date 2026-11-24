package server

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"net"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"

	"github.com/umaxyon/matomezu/internal/aiwire"
	"github.com/umaxyon/matomezu/internal/engine"
	"github.com/umaxyon/matomezu/internal/peer"
)

// pairedWorlds は、入口を開いてペアリングした 2 つのホスト（a・b。AI の入口つき）を組み、両方がつながるまで待つ
func pairedWorlds(t *testing.T) (as, bs *httptest.Server, a, b *Hub) {
	t.Helper()
	as, a = joinWorld(t, joinStore(t))
	bs, b = joinWorld(t, joinStore(t))
	var aStatus, bStatus HostStatus
	for _, w := range []struct {
		h    *Hub
		name string
		s    *HostStatus
	}{{a, "a", &aStatus}, {b, "b", &bStatus}} {
		saved := 0
		testHost(t, w.h, 0, &saved)
		setHostSettings(t, w.h, `{"@matomezu/network:connect-hosts":true,"@matomezu/network:host-name":"`+w.name+`"}`)
		*w.s = waitHost(t, w.h, func(s HostStatus) bool { return s.Open })
	}
	_ = a.StartPairing(addrOf(bStatus), true)
	waitFor(t, "the request on B", func() bool { return len(requestsOf(b)) == 1 })
	userDoes(t, b, "@matomezu/network:pairing-accept", requestsOf(b)[0].ID)
	waitFor(t, "accepted", func() bool { return pairingPhase(a) == "accepted" })
	a.CheckPeers()
	waitFor(t, "both connected", func() bool {
		pa, pb := a.HostPeers().Paired, b.HostPeers().Paired
		return len(pa) == 1 && pa[0].State == PeerConnected && pa[0].Label == "b" && len(pb) == 1 && pb[0].State == PeerConnected && pb[0].Label == "a"
	})
	return as, bs, a, b
}

// sendTo は、参加の id from の AI として、ホスト host のワークルーム to に送る
func sendTo(t *testing.T, srv, from, host, to, text string) MessageSent {
	t.Helper()
	body, _ := json.Marshal(map[string]string{"to": to, "host": host, "text": text})
	got, _ := call(t, "POST", srv+"/api/ai/message", string(body), map[string]string{aiwire.ParticipantHeader: from})
	var sent MessageSent
	if err := json.Unmarshal([]byte(got), &sent); err != nil {
		t.Fatalf("message = %s", got)
	}
	return sent
}

// ペアリングしたホストの AI へ送ると、受けたホストの参加者に、送り手のホストエイリアスつきの行で届く。requests が as-user なら印が付く
func TestAMessageGoesToAPairedHost(t *testing.T) {
	as, bs, _, b := pairedWorlds(t)
	s1 := joinedIn(t, as.URL, "LA", "100", "SA", "s1")
	joinedIn(t, bs.URL, "LB", "200", "SB", "s2")
	if sent := sendTo(t, as.URL, s1, "b", "s2", "やあ"); !sent.OK || !sent.Queued {
		t.Fatalf("sent = %+v", sent)
	}
	if got := wakes(b, b.OpenWakesWith("200", "", WakeLimits{})); len(got) != 1 || got[0] != `matomezu from AI "s1" on host "a": "やあ"` {
		t.Fatalf("wakes = %q", got)
	}
	// B の利用者が A からの頼みを as-user にすると、そのあとに届く行に印が付く
	rec := b.pairedHostRecords()[0]
	if out, err := b.Perform(performOne("@matomezu/network:paired-host-requests-set", json.RawMessage(`{"requests":"as-user"}`), &engine.On{Record: rec.ID})); err != nil || !out.OK {
		t.Fatalf("requests-set = %+v, %v", out, err)
	}
	waitFor(t, "B knows as-user", func() bool { _, asUser, _ := b.entrance.Load().peers.labelOf(rec.HostID); return asUser })
	if sent := sendTo(t, as.URL, s1, "b", "s2", "頼み"); !sent.OK {
		t.Fatalf("sent = %+v", sent)
	}
	if got := wakes(b, b.OpenWakesWith("200", "", WakeLimits{})); len(got) != 1 || got[0] != `matomezu from AI "s1" on host "a" (as your user's request): "頼み"` {
		t.Fatalf("wakes = %q", got)
	}
}

// 行列に残っている印つきの行は、利用者が ask-user に戻すと印が外れ、ペアリングを解くと捨てる
func TestQueuedLinesFollowTheRequestsAndThePairing(t *testing.T) {
	as, bs, _, b := pairedWorlds(t)
	s1 := joinedIn(t, as.URL, "LA", "100", "SA", "s1")
	joinedIn(t, bs.URL, "LB", "200", "SB", "s2")
	rec := b.pairedHostRecords()[0]
	set := func(v string) {
		if out, err := b.Perform(performOne("@matomezu/network:paired-host-requests-set", json.RawMessage(`{"requests":"`+v+`"}`), &engine.On{Record: rec.ID})); err != nil || !out.OK {
			t.Fatalf("requests-set = %+v, %v", out, err)
		}
		waitFor(t, "B knows "+v, func() bool {
			_, asUser, _ := b.entrance.Load().peers.labelOf(rec.HostID)
			return asUser == (v == "as-user")
		})
	}
	set("as-user")
	if sent := sendTo(t, as.URL, s1, "b", "s2", "頼み"); !sent.OK {
		t.Fatalf("sent = %+v", sent)
	}
	set("ask-user")
	if got := wakes(b, b.OpenWakesWith("200", "", WakeLimits{})); len(got) != 1 || got[0] != `matomezu from AI "s1" on host "a": "頼み"` {
		t.Fatalf("wakes = %q", got)
	}
	// ペアリングを解いたら、そのホストから届いてまだ渡していない行は捨てる（返事の宛先をもう引けない）
	if sent := sendTo(t, as.URL, s1, "b", "s2", "もう 1 つ"); !sent.OK {
		t.Fatalf("sent = %+v", sent)
	}
	if out, err := b.Perform(performOne("@matomezu/network:paired-host-remove", json.RawMessage(`{}`), &engine.On{Record: rec.ID})); err != nil || !out.OK {
		t.Fatalf("remove = %+v, %v", out, err)
	}
	waitFor(t, "B drops the lines from A", func() bool {
		b.mu.Lock()
		defer b.mu.Unlock()
		for _, q := range b.wakeQueue {
			for _, it := range q {
				if it.peer != "" {
					return false
				}
			}
		}
		return true
	})
}

// 断り: ホストエイリアスの無いホスト（送れるホストエイリアスを添える）・宛て先のワークルームに AI がいない（受けたホストの送れる名前を添える）・自分の入口が閉じている
func TestMessagesToOtherHostsAreRefused(t *testing.T) {
	as, bs, a, _ := pairedWorlds(t)
	s1 := joinedIn(t, as.URL, "LA", "100", "SA", "s1")
	joinedIn(t, bs.URL, "LB", "200", "SB", "s2")
	for _, c := range []struct{ host, to, reason, detail string }{
		{"c", "s2", "unknown-host", "the paired hosts are: b"},
		{"b", "s3", "unknown-recipient", "you can send to: s2"},
		{"b", strings.Repeat("長", workroomNameMax+1), "unknown-recipient", "no workroom has a name longer than"},
	} {
		if sent := sendTo(t, as.URL, s1, c.host, c.to, "hi"); sent.OK || sent.Reason != c.reason || !strings.Contains(sent.Detail, c.detail) {
			t.Fatalf("to %s on %s = %+v", c.to, c.host, sent)
		}
	}
	setHostSettings(t, a, `{"@matomezu/network:connect-hosts":false}`)
	waitHost(t, a, func(s HostStatus) bool { return !s.Open })
	if sent := sendTo(t, as.URL, s1, "b", "s2", "hi"); sent.OK || sent.Reason != "host-closed" {
		t.Fatalf("closed = %+v", sent)
	}
}

// 受けたホストは、TLS で見た相手と違う送り手のホストや、自分宛てでない封筒を断り、同じ id の封筒は 1 通にする
func TestTheMessageEntranceChecksTheEnvelope(t *testing.T) {
	_, bs, a, b := pairedWorlds(t)
	joinedIn(t, bs.URL, "LB", "200", "SB", "s2")
	e := a.entrance.Load()
	bID := b.selfHostID()
	addr := a.peerAddr(e, a.pairedHostRecords()[0])
	c := peer.Client(e.config.Identity, bID, peer.Protocol, peerAskTimeout)
	post := func(env Envelope) int {
		resp, err := c.Post("https://"+addr+"/peer/v1/message", "application/json", bytes.NewReader(mustJSON(env)))
		if err != nil {
			t.Fatal(err)
		}
		resp.Body.Close()
		return resp.StatusCode
	}
	good := Envelope{ID: "e1", From: Address{Host: a.selfHostID(), Workroom: "s1"}, To: Address{Host: bID, Workroom: "s2"}, Text: "hi"}
	forged := good
	forged.From.Host = strings.Repeat("c", 64)
	elsewhere := good
	elsewhere.To.Host = strings.Repeat("d", 64)
	for name, env := range map[string]Envelope{"forged": forged, "elsewhere": elsewhere} {
		if got := post(env); got != http.StatusBadRequest {
			t.Fatalf("%s = %d", name, got)
		}
	}
	if post(good) != http.StatusOK || post(good) != http.StatusOK {
		t.Fatal("the good one is refused")
	}
	if got := wakes(b, b.OpenWakesWith("200", "", WakeLimits{})); len(got) != 1 {
		t.Fatalf("wakes = %q", got)
	}
}

// roomsSeen は、ホスト h が持つ、ただ 1 つのペアリングしたホストのワークルームの写し（名前 → 様子）
func roomsSeen(h *Hub) map[string]string {
	out := map[string]string{}
	if p := h.HostPeers().Paired; len(p) == 1 {
		for _, r := range p[0].Workrooms {
			out[r.Name] = r.Activity
		}
	}
	return out
}

// つながると相手の一覧を取り直し、そのあとは相手の一覧が変わるたびに差分が届いて写しが変わる。写しが差分と合わなければ取り直す
func TestPairedHostsKeepCopiesOfEachOthersWorkrooms(t *testing.T) {
	as, bs, a, b := pairedWorlds(t)
	joinedIn(t, bs.URL, "LB", "200", "SB", "s2")
	waitFor(t, "A sees s2", func() bool { _, ok := roomsSeen(a)["s2"]; return ok })
	joinedIn(t, bs.URL, "LC", "300", "SC", "s3")
	waitFor(t, "A sees s3 by a diff", func() bool { return len(roomsSeen(a)) == 2 })
	// A の写しの番号をずらすと、次の差分は当たらず、取り直して合う
	ps := a.entrance.Load().peers
	ps.mu.Lock()
	for _, c := range ps.copies {
		c.version = -5
		delete(c.rows, "s2")
	}
	ps.mu.Unlock()
	joinedIn(t, bs.URL, "LD", "400", "SD", "s4")
	waitFor(t, "A refetched", func() bool { return len(roomsSeen(a)) == 3 })
	// 逆向きも同じ: B には A の AI だけが見える
	joinedIn(t, as.URL, "LA", "100", "SA", "s1")
	waitFor(t, "B sees s1", func() bool { seen := roomsSeen(b); _, ok := seen["s1"]; return ok && len(seen) == 1 })
}

// 取り直しは、手元の印が今の起動の物で、覚えている変わりで間に合えば差分、ほかは全部
func TestChangesSince(t *testing.T) {
	history := []roomDiff{
		{From: 3, To: 4, Changes: []roomChange{{Name: "x", Activity: "idle"}}},
		{From: 4, To: 5, Changes: []roomChange{{Name: "x", Removed: true}, {Name: "y", Activity: "working"}}},
	}
	if got, ok := changesSince(history, 3, 5); !ok || len(got) != 2 || !got[0].Removed || got[1].Name != "y" {
		t.Fatalf("since 3 = %+v, %v", got, ok)
	}
	if got, ok := changesSince(history, 5, 5); !ok || len(got) != 0 {
		t.Fatalf("since 5 = %+v, %v", got, ok)
	}
	if _, ok := changesSince(history, 1, 5); ok {
		t.Fatal("since 1 is answered by a diff")
	}
}

// AI が読むワークルームの一覧: 引数なしは AI 用ホストリスト（このホストと、ペアリングしたホストの最近の行）、host はそのホストの写しを名前の順に
func TestAIListsTheWorkroomsOfPairedHosts(t *testing.T) {
	as, bs, a, _ := pairedWorlds(t)
	s1 := joinedIn(t, as.URL, "LA", "100", "SA", "s1")
	joinedIn(t, bs.URL, "LB", "200", "SB", "s2")
	waitFor(t, "A sees s2", func() bool { _, ok := roomsSeen(a)["s2"]; return ok })
	read := func(q string) string {
		got, _ := call(t, "GET", as.URL+"/api/ai/workrooms"+q, "", map[string]string{aiwire.ParticipantHeader: s1})
		return got
	}
	if got := read(""); !strings.Contains(got, `"workrooms":[{"name":"s1","activity":`) ||
		!strings.Contains(got, `"hosts":[{"name":"b","connected":true,"workrooms":[{"name":"s2","activity":`) {
		t.Fatalf("own = %s", got)
	}
	if got := read("?host=b"); !strings.Contains(got, `"host":"b","connected":true,"workrooms":[{"name":"s2","activity":`) || !strings.Contains(got, `"more":0`) {
		t.Fatalf("b = %s", got)
	}
	if got := read("?host=c"); !strings.Contains(got, `"reason":"unknown-host"`) || !strings.Contains(got, "the paired hosts are: b") {
		t.Fatalf("c = %s", got)
	}
}

// ペアリングしたホストに AI が多くても、AI 用ホストリストは最近の 5 件と残りの数で、外れた相手は名前で引け、send_message の断りがそのホストを言う。
// 隠したホストはAI 用ホストリストに出ず、名前とそのホストを読む口では見つかる。続きは名前の順に offset から読む
func TestAIFindsAWorkroomBeyondTheOverview(t *testing.T) {
	as, bs, a, _ := pairedWorlds(t)
	s1 := joinedIn(t, as.URL, "LA", "100", "SA", "s1")
	names := []string{"w1", "w2", "w3", "w4", "w5", "w6", "win_note"}
	for i, n := range names {
		joinedIn(t, bs.URL, "L"+n, strconv.Itoa(300+i), "S"+n, n)
	}
	waitFor(t, "A sees all of B", func() bool { return len(roomsSeen(a)) == len(names) })
	read := func(q string) string {
		got, _ := call(t, "GET", as.URL+"/api/ai/workrooms"+q, "", map[string]string{aiwire.ParticipantHeader: s1})
		return got
	}
	var over aiHostList
	if err := json.Unmarshal([]byte(read("")), &over); err != nil || over.Hosts == nil || len(*over.Hosts) != 1 {
		t.Fatalf("overview = %+v, %v", over, err)
	}
	if h := (*over.Hosts)[0]; len(h.Workrooms) != 5 || h.More != 2 {
		t.Fatalf("overview of b = %+v", h)
	}
	if got := read("?name=win_note"); !strings.Contains(got, `"found":[{"host":"b","name":"win_note","activity":`) {
		t.Fatalf("name = %s", got)
	}
	if sent, _ := sendMessage(t, as.URL, s1, "win_note", "図を"); sent.Reason != "unknown-recipient" || !strings.Contains(sent.Detail, "a workroom named win_note is on the paired host b") {
		t.Fatalf("sent = %+v", sent)
	}
	var page workroomsPage
	if err := json.Unmarshal([]byte(read("?host=b&offset=5")), &page); err != nil || len(page.Workrooms) != 2 || page.Workrooms[0].Name != "w6" || page.More != 0 || page.Next != nil {
		t.Fatalf("page = %+v, %v", page, err)
	}
	for _, q := range []string{"?name=win_note&host=b", "?name=win_note&offset=0"} {
		if got := read(q); !strings.Contains(got, `"reason":"bad-arguments"`) {
			t.Fatalf("%s = %s", q, got)
		}
	}
	// このホストのワークルームは host を書かずに見つかる
	if got := read("?name=s1"); !strings.Contains(got, `"found":[{"name":"s1","activity":`) {
		t.Fatalf("own name = %s", got)
	}
	// 隠すとAI 用ホストリストから外れ、名前・そのホストを読む口・断りでは見つかる
	rec := a.pairedHostRecords()[0]
	if out, err := a.Perform(performOne("@matomezu/network:paired-host-listed-set", json.RawMessage(`{"listed":"hidden"}`), &engine.On{Record: rec.ID})); err != nil || !out.OK {
		t.Fatalf("listed-set = %+v, %v", out, err)
	}
	waitFor(t, "A hides b", func() bool { return strings.Contains(read(""), `"hosts":[]`) })
	if got := read("?name=win_note"); !strings.Contains(got, `"host":"b"`) {
		t.Fatalf("name when hidden = %s", got)
	}
	if got := read("?host=b"); !strings.Contains(got, `"name":"win_note"`) {
		t.Fatalf("host when hidden = %s", got)
	}
	if sent, _ := sendMessage(t, as.URL, s1, "win_note", "図を"); !strings.Contains(sent.Detail, "on the paired host b") {
		t.Fatalf("sent when hidden = %+v", sent)
	}
}

// AI 用ホストリストのこのホストの分は、設定が recent なら最近の 5 件と残りの数（全部は offset で名前の順に）。既定は全部
func TestOwnWorkroomsFollowTheListedSetting(t *testing.T) {
	as, a := joinWorld(t, joinStore(t))
	saved := 0
	testHost(t, a, 0, &saved)
	var first string
	for i := range 7 {
		p := joinedIn(t, as.URL, "L"+strconv.Itoa(i), strconv.Itoa(100+i), "S"+strconv.Itoa(i), "r"+strconv.Itoa(i))
		if i == 0 {
			first = p
		}
	}
	read := func(q string) aiHostList {
		got, _ := call(t, "GET", as.URL+"/api/ai/workrooms"+q, "", map[string]string{aiwire.ParticipantHeader: first})
		var out aiHostList
		if err := json.Unmarshal([]byte(got), &out); err != nil {
			t.Fatalf("overview = %s", got)
		}
		return out
	}
	if got := read(""); len(got.Workrooms) != 7 || got.More != 0 {
		t.Fatalf("all = %+v", got)
	}
	setHostSettings(t, a, `{"@matomezu/network:listed-workrooms":"recent"}`)
	if got := read(""); len(got.Workrooms) != 5 || got.More != 2 {
		t.Fatalf("recent = %+v", got)
	}
	if got := read("?offset=5"); len(got.Workrooms) != 2 || got.Workrooms[0].Name != "r5" || got.More != 0 {
		t.Fatalf("offset = %+v", got)
	}
	// 自分の一覧に番号が付いたあとに足した行が先頭に来て、名前の順で前の行より前に並ぶ
	waitFor(t, "own rows are noted", func() bool { return len(a.ownSeqs()) == 7 })
	joinedIn(t, as.URL, "L7", "107", "S7", "a7")
	waitFor(t, "a7 is noted", func() bool { _, ok := a.ownSeqs()["a7"]; return ok })
	if got := read(""); got.Workrooms[0].Name != "a7" || got.Workrooms[1].Name != "r6" {
		t.Fatalf("recent order = %+v", got.Workrooms)
	}
	// 断りの送れる先も最近の 5 件と残りの数
	if sent, _ := sendMessage(t, as.URL, first, "nobody", "x"); !strings.Contains(sent.Detail, " and 2 more (list_workrooms with offset lists them all)") {
		t.Fatalf("sent = %+v", sent)
	}
}

// 名前の順に読む答えは 50 件ずつで、残りがあるときだけ続きの offset を添える
func TestWorkroomPagesTellTheNextOffset(t *testing.T) {
	rows := make([]RoomRow, 120)
	for i := range rows {
		rows[i] = RoomRow{Name: fmt.Sprintf("r%03d", i)}
	}
	if p := pageOf(rows, 0); len(p.Workrooms) != 50 || p.More != 70 || p.Next == nil || *p.Next != 50 {
		t.Fatalf("first = %d, %d, %v", len(p.Workrooms), p.More, p.Next)
	}
	if p := pageOf(rows, 100); len(p.Workrooms) != 20 || p.More != 0 || p.Next != nil || p.Workrooms[0].Name != "r100" {
		t.Fatalf("last = %d, %d, %v", len(p.Workrooms), p.More, p.Next)
	}
}

// 一覧の行の通し番号: 様子の同じ行は番号を保ち、足された・様子の変わった行に名前の順で新しい番号。差分も同じ
func TestRoomRowsKeepTheOrderOfChanges(t *testing.T) {
	ps := &peerState{}
	rows := ps.noteRowsLocked(nil, map[string]string{"b": "idle", "a": "idle"})
	if rows["a"].seq != 1 || rows["b"].seq != 2 {
		t.Fatalf("first = %+v", rows)
	}
	rows = ps.noteRowsLocked(rows, map[string]string{"a": "working", "b": "idle", "c": "idle"})
	if rows["b"].seq != 2 || rows["a"].seq != 3 || rows["c"].seq != 4 {
		t.Fatalf("second = %+v", rows)
	}
	ps.applyChangesLocked(rows, []roomChange{{Name: "b", Activity: "idle"}, {Name: "c", Removed: true}, {Name: "d", Activity: "working"}})
	if _, ok := rows["c"]; ok || rows["b"].seq != 2 || rows["d"].seq != 5 {
		t.Fatalf("applied = %+v", rows)
	}
	got, more := headOf(byRecent(entriesOf(rows)), 2)
	if more != 1 || got[0].Name != "d" || got[1].Name != "a" {
		t.Fatalf("recent = %+v, %d", got, more)
	}
}

// ホストエイリアスは今の名前（つながったときに聞いた物。無ければペアリングしたときの名前）で、同じ名前が 2 つ以上あるときだけ鍵の印の頭（4 字から、違うまで）を添える
func TestPairedHostLabelsAddTheKeyHeadOnlyWhenNamesRepeat(t *testing.T) {
	a, b, c := "7f3a"+strings.Repeat("0", 60), "c41e"+strings.Repeat("1", 60), "9b20"+strings.Repeat("2", 60)
	ps := &peerState{
		known: map[string]pairedHostRecord{
			a: {HostID: a, NameAtPairing: "win-lan"},
			b: {HostID: b, NameAtPairing: "old"},
			c: {HostID: c, NameAtPairing: "mac"},
		},
		live: map[string]*PeerLive{b: {Name: "win-lan"}},
	}
	got := ps.labelsLocked()
	want := map[string]string{a: "win-lan · 7F3A", b: "win-lan · C41E", c: "mac"}
	for id, w := range want {
		if got[id] != w {
			t.Errorf("label of %s = %q, want %q", id[:4], got[id], w)
		}
	}
	if r, _ := ps.byLabel("win-lan · C41E"); r == nil || r.HostID != b {
		t.Errorf("byLabel did not find the host by its label: %v", r)
	}
	// 頭 4 字まで同じなら、違うまで伸ばす
	d := "7f3a9" + strings.Repeat("3", 59)
	ps.known[d] = pairedHostRecord{HostID: d, NameAtPairing: "win-lan"}
	if got := ps.labelsLocked(); got[a] != "win-lan · 7F3A0" || got[d] != "win-lan · 7F3A9" || got[b] != "win-lan · C41E1" {
		t.Errorf("labels when the heads repeat = %v", got)
	}
	delete(ps.known, d)
	ps.live[b].Name = "linux"
	if got := ps.labelsLocked(); got[a] != "win-lan" || got[b] != "linux" {
		t.Errorf("labels after the name changed = %v", got)
	}
}

// 確かに届いていないと言えるのは、つなげなかった・鍵が合わなかった・TLS を結べなかった・ペアリングしていないと答えた・相手が受けなかったと答えたときだけ
func TestNotSentOnlyWhenTheMessageCertainlyDidNotArrive(t *testing.T) {
	cases := []struct {
		err  error
		want bool
	}{
		{&net.OpError{Op: "dial", Err: errors.New("connection refused")}, true},
		{fmt.Errorf("Post: %w", peer.ErrKeyMismatch), true},
		{errors.New("net/http: TLS handshake timeout"), true},
		{peer.ErrNotPaired, true},
		{fmt.Errorf("Post: %w", peer.ProtocolMismatchError{Ours: 1, Theirs: 2}), true},
		{&net.OpError{Op: "read", Err: errors.New("connection reset")}, false},
		{errors.New("context deadline exceeded (Client.Timeout exceeded while awaiting headers)"), false},
		{fmt.Errorf("post: %w", answeredError{404}), true},
		{fmt.Errorf("the answer could not be read: %w", errors.New("unexpected end of JSON input")), false},
	}
	for _, c := range cases {
		if got := notSent(c.err); got != c.want {
			t.Errorf("notSent(%v) = %v, want %v", c.err, got, c.want)
		}
	}
}

// reopenWithProtocol は、h の入口を閉じ、約束の版を proto にして開き直す（片方だけ matomezu を更新したのと同じ）
func reopenWithProtocol(t *testing.T, h *Hub, proto int) {
	t.Helper()
	setHostSettings(t, h, `{"@matomezu/network:connect-hosts":false}`)
	waitHost(t, h, func(s HostStatus) bool { return !s.Open })
	e := h.entrance.Load()
	e.mu.Lock()
	e.proto = proto
	e.mu.Unlock()
	setHostSettings(t, h, `{"@matomezu/network:connect-hosts":true}`)
	waitHost(t, h, func(s HostStatus) bool { return s.Open })
}

// ペアリングしたあとで片方の約束の版が上がると、確かめたときに両方の様子が、どちらを更新すれば合うかになり、ワークルームの写しを捨てる
func TestAHostWithAnotherProtocolIsNotConnected(t *testing.T) {
	_, _, a, b := pairedWorlds(t)
	reopenWithProtocol(t, b, peer.Protocol+1)
	a.CheckPeers()
	b.CheckPeers()
	waitFor(t, "both see the mismatch", func() bool {
		pa, pb := a.HostPeers().Paired, b.HostPeers().Paired
		return len(pa) == 1 && pa[0].State == PeerUpdateThis && pa[0].Workrooms == nil && len(pb) == 1 && pb[0].State == PeerUpdateThat
	})
	if len(a.pairedHostRecords()) != 1 || len(b.pairedHostRecords()) != 1 {
		t.Fatal("a protocol mismatch should not unpair")
	}
}

// 約束の版の合わないホストへは送らず、protocol-mismatch で、どちらを更新するかを言う
func TestAMessageToAHostWithAnotherProtocolIsRefused(t *testing.T) {
	as, bs, _, b := pairedWorlds(t)
	s1 := joinedIn(t, as.URL, "LA", "100", "SA", "s1")
	s2 := joinedIn(t, bs.URL, "LB", "200", "SB", "s2")
	reopenWithProtocol(t, b, peer.Protocol+1)
	if sent := sendTo(t, as.URL, s1, "b", "s2", "やあ"); sent.OK || sent.Reason != "protocol-mismatch" || !strings.Contains(sent.Detail, "update this host") {
		t.Fatalf("sent from the older = %+v", sent)
	}
	if sent := sendTo(t, bs.URL, s2, "a", "s1", "やあ"); sent.OK || sent.Reason != "protocol-mismatch" || !strings.Contains(sent.Detail, "update host a ") {
		t.Fatalf("sent from the newer = %+v", sent)
	}
	if got := wakes(b, b.OpenWakesWith("200", "", WakeLimits{})); len(got) != 0 {
		t.Fatalf("it arrived: %q", got)
	}
}
