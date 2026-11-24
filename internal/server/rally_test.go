package server

import (
	"encoding/json"
	"strings"
	"testing"

	"github.com/umaxyon/matomezu/internal/engine"
)

// 同じホストの中の AI ラリーは、向きごとに上限まで届き、超えた物は届けずに断り、宛て先には止めた事を 1 度だけ知らせる。
// 知らせで始まったターンでは戻らず、送り手か宛て先の AI に利用者トリガートークがあったら数が戻る
func TestRallyStopsAtTheLimitUntilAUserTalks(t *testing.T) {
	for _, talker := range []string{"SA", "SB"} {
		t.Run(talker, func(t *testing.T) {
			s, _ := joinWorld(t, joinStore(t))
			a := joinedIn(t, s.URL, "LA", "100", "SA", "ひよこ")
			b := joinedIn(t, s.URL, "LB", "200", "SB", "すずめ")
			noticeOf(t, s.URL, b)
			for i := range rallyLocalLimit {
				if sent, _ := sendMessage(t, s.URL, a, "すずめ", "hi"); !sent.OK {
					t.Fatalf("message %d = %+v", i+1, sent)
				}
				noticeOf(t, s.URL, b)
			}
			// 逆の向きは別に数える
			if sent, _ := sendMessage(t, s.URL, b, "ひよこ", "back"); !sent.OK {
				t.Fatalf("the other way = %+v", sent)
			}
			for range 2 {
				sent, _ := sendMessage(t, s.URL, a, "すずめ", "over")
				if sent.OK || sent.Reason != "rally-limit" || !strings.Contains(sent.Detail, "すずめ") {
					t.Fatalf("over the limit = %+v", sent)
				}
			}
			n := noticeOf(t, s.URL, b)
			if strings.Contains(n, `"over"`) || strings.Count(n, "stopped the exchange") != 1 || !strings.Contains(n, "ひよこ") {
				t.Fatalf("notice to the recipient = %q", n)
			}
			call(t, "POST", s.URL+"/api/ai/talked", `{"sessionId":"`+talker+`","woken":true,"prompt":"x"}`, nil)
			if sent, _ := sendMessage(t, s.URL, a, "すずめ", "over"); sent.OK {
				t.Fatal("a woken turn put the count back")
			}
			call(t, "POST", s.URL+"/api/ai/talked", `{"sessionId":"`+talker+`","prompt":"続けて"}`, nil)
			if sent, _ := sendMessage(t, s.URL, a, "すずめ", "again"); !sent.OK {
				t.Fatalf("after the user talked = %+v", sent)
			}
		})
	}
}

// ほかのホストから届く物は、こちらの数と封筒の送り手の側の数の両方が上限を超えたときだけ止め、封筒に数が無い（古いホスト）ならこちらの数だけで決める
func TestRallyFromAnotherHostCountsBothSides(t *testing.T) {
	h := emptyHub(t)
	peerFrom := func(rally int) bool {
		h.mu.Lock()
		defer h.mu.Unlock()
		return h.deliver(delivery{to: "P", peer: "H", host: "behoma", limit: 2, envelope: Envelope{ID: newEnvelopeID(), From: Address{Host: "H", Workroom: "w"}, Text: "t", Rally: rally}})
	}
	for _, c := range []struct {
		rally int
		want  bool
	}{
		{1, true}, {2, true}, {3, false}, {4, false},
		{1, true}, // 送り手の利用者が話した（送り手の側の数が戻った）
		{0, false},
	} {
		if got := peerFrom(c.rally); got != c.want {
			t.Fatalf("rally %d = %v", c.rally, got)
		}
	}
	h.mu.Lock()
	h.rallyReset("P", map[string]bool{"P": true})
	h.mu.Unlock()
	if !peerFrom(0) {
		t.Fatal("the recipient's user talked, but it is still stopped")
	}
}

// ほかのホストへ送る数は、送り手の AI に利用者トリガートークがあったら戻る
func TestRallySentCountGoesBackWhenTheSenderTalks(t *testing.T) {
	h := emptyHub(t)
	h.mu.Lock()
	defer h.mu.Unlock()
	h.rallyCountSent("A", "H", "w")
	if n := h.rallyCountSent("A", "H", "w"); n != 2 {
		t.Fatalf("count = %d", n)
	}
	if n := h.rallyCountSent("B", "H", "w"); n != 1 {
		t.Fatalf("another sender = %d", n)
	}
	h.rallyReset("A", map[string]bool{"A": true, "B": true})
	if n := h.rallyCountSent("A", "H", "w"); n != 1 {
		t.Fatalf("after A talked = %d", n)
	}
	if n := h.rallyCountSent("B", "H", "w"); n != 2 {
		t.Fatalf("B after A talked = %d", n)
	}
}

// ペアリングしたホストの上限は、記録の値（範囲の外と無い物は既定）
func TestRallyLimitOfAPairedHost(t *testing.T) {
	for _, c := range []struct{ in, want int }{{0, rallyLimitDefault}, {1, 1}, {50, 50}, {51, rallyLimitDefault}, {-3, rallyLimitDefault}} {
		if got := rallyLimitOf(pairedHostRecord{RallyLimit: c.in}); got != c.want {
			t.Errorf("%d = %d", c.in, got)
		}
	}
}

// ペアリングしたホストの間: 受けるホストの利用者が決めた上限（rallyLimit）で止め、送り手には rally-limit で断り、宛て先には 1 度だけ知らせる。
// 送り手の利用者が送り手の AI に話しかけたら、送り手のホストが封筒に載せる数が戻るので、また届く
func TestRallyBetweenPairedHosts(t *testing.T) {
	as, bs, _, b := pairedWorlds(t)
	s1 := joinedIn(t, as.URL, "LA", "100", "SA", "s1")
	joinedIn(t, bs.URL, "LB", "200", "SB", "s2")
	rec := b.pairedHostRecords()[0]
	if out, err := b.Perform(performOne("@matomezu/network:paired-host-rally-limit-set", json.RawMessage(`{"rallyLimit":2}`), &engine.On{Record: rec.ID})); err != nil || !out.OK {
		t.Fatalf("rally-limit-set = %+v, %v", out, err)
	}
	waitFor(t, "B knows the limit", func() bool { _, _, limit := b.entrance.Load().peers.labelOf(rec.HostID); return limit == 2 })
	for i := range 2 {
		if sent := sendTo(t, as.URL, s1, "b", "s2", "hi"); !sent.OK {
			t.Fatalf("message %d = %+v", i+1, sent)
		}
	}
	if sent := sendTo(t, as.URL, s1, "b", "s2", "over"); sent.OK || sent.Reason != "rally-limit" {
		t.Fatalf("over the limit = %+v", sent)
	}
	got := wakes(b, b.OpenWakesWith("200", "", WakeLimits{}))
	if len(got) != 3 || !strings.Contains(got[2], "stopped the exchange") || !strings.Contains(got[2], `host a`) {
		t.Fatalf("wakes = %q", got)
	}
	call(t, "POST", as.URL+"/api/ai/talked", `{"sessionId":"SA","prompt":"続けて"}`, nil)
	if sent := sendTo(t, as.URL, s1, "b", "s2", "again"); !sent.OK {
		t.Fatalf("after the sender's user talked = %+v", sent)
	}
}
