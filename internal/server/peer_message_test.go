package server

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
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
		return len(pa) == 1 && pa[0].Connected && pa[0].Label == "b" && len(pb) == 1 && pb[0].Connected && pb[0].Label == "a"
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

// ペアリングしたホストの AI へ送ると、受けたホストの参加者に、送り手のホストの呼び名つきの行で届く。頼みの扱いが as-user なら印が付く
func TestAMessageGoesToAPairedHost(t *testing.T) {
	as, bs, a, b := pairedWorlds(t)
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
	waitFor(t, "B knows as-user", func() bool { _, asUser := b.entrance.Load().peers.labelOf(rec.HostID); return asUser })
	if sent := sendTo(t, as.URL, s1, "b", "s2", "頼み"); !sent.OK {
		t.Fatalf("sent = %+v", sent)
	}
	if got := wakes(b, b.OpenWakesWith("200", "", WakeLimits{})); len(got) != 1 || got[0] != `matomezu from AI "s1" on host "a" (as your user's request): "頼み"` {
		t.Fatalf("wakes = %q", got)
	}
	_ = a
}

// 行列に残っている印つきの行は、利用者が ask-user に戻すと印が外れる
func TestQueuedMarkedLinesLoseTheMarkWhenAskUserIsBack(t *testing.T) {
	as, bs, _, b := pairedWorlds(t)
	s1 := joinedIn(t, as.URL, "LA", "100", "SA", "s1")
	joinedIn(t, bs.URL, "LB", "200", "SB", "s2")
	rec := b.pairedHostRecords()[0]
	set := func(v string) {
		if out, err := b.Perform(performOne("@matomezu/network:paired-host-requests-set", json.RawMessage(`{"requests":"`+v+`"}`), &engine.On{Record: rec.ID})); err != nil || !out.OK {
			t.Fatalf("requests-set = %+v, %v", out, err)
		}
		waitFor(t, "B knows "+v, func() bool {
			_, asUser := b.entrance.Load().peers.labelOf(rec.HostID)
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
}

// 断り: 呼び名の無いホスト（送れる呼び名を添える）・宛て先のワークルームに AI がいない（受けたホストの送れる名前を添える）・自分の入口が閉じている
func TestMessagesToOtherHostsAreRefused(t *testing.T) {
	as, bs, a, _ := pairedWorlds(t)
	s1 := joinedIn(t, as.URL, "LA", "100", "SA", "s1")
	joinedIn(t, bs.URL, "LB", "200", "SB", "s2")
	for _, c := range []struct{ host, to, reason, detail string }{
		{"c", "s2", "unknown-host", "you can send to hosts: b"},
		{"b", "s3", "unknown-recipient", "you can send to: s2"},
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
	c := peer.Client(e.config.Identity, bID, peerAskTimeout)
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
