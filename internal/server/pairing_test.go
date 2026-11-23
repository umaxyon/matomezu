package server

import (
	"encoding/json"
	"net"
	"net/http"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/umaxyon/matomezu/internal/engine"
	"github.com/umaxyon/matomezu/internal/peer"
)

// openHost は、入口を開いたホストを組む（mDNS は使わない）
func openHost(t *testing.T, name string) (*Hub, HostStatus) {
	t.Helper()
	h := emptyHub(t)
	saved := 0
	testHost(t, h, 0, &saved)
	setHostSettings(t, h, `{"@matomezu/network:connect-hosts":true,"@matomezu/network:host-name":"`+name+`","@matomezu/base:user-name":"`+name+`-user"}`)
	return h, waitHost(t, h, func(s HostStatus) bool { return s.Open })
}

func addrOf(s HostStatus) string { return net.JoinHostPort("127.0.0.1", strconv.Itoa(s.Port)) }

func waitFor(t *testing.T, what string, ok func() bool) {
	t.Helper()
	deadline := time.Now().Add(5 * time.Second)
	for !ok() {
		if time.Now().After(deadline) {
			t.Fatal("not reached: " + what)
		}
		time.Sleep(10 * time.Millisecond)
	}
}

func pairingPhase(h *Hub) string {
	if p := h.HostPeers().Pairing; p != nil {
		return p.Phase
	}
	return ""
}

type requestRecord struct {
	ID, HostID, Name, UserName, Addr, Code string
}

func requestsOf(h *Hub) []requestRecord {
	h.mu.Lock()
	defer h.mu.Unlock()
	var out []requestRecord
	for _, b := range h.recordsOfRole("pairing-requests") {
		var r requestRecord
		_ = json.Unmarshal(b, &r)
		out = append(out, r)
	}
	return out
}

func userDoes(t *testing.T, h *Hub, action, on string) {
	t.Helper()
	if out, err := h.Perform(performOne(action, json.RawMessage(`{}`), &engine.On{Record: on})); err != nil || !out.OK {
		t.Fatalf("%s = %+v, %v", action, out, err)
	}
}

// A が B に頼むと、B に頼みが載り、両方に同じ接続確認コードが出る。B の利用者が受け入れると、両方にペアリングしたホストが載り、互いの hello に通る
func TestPairingAcceptedPutsBothSides(t *testing.T) {
	a, as := openHost(t, "masa-wsl")
	b, bs := openHost(t, "win-lan")
	if err := a.StartPairing(addrOf(bs), true); err != nil {
		t.Fatal(err)
	}
	waitFor(t, "the request on B", func() bool { return len(requestsOf(b)) == 1 })
	r := requestsOf(b)[0]
	waitFor(t, "A waits", func() bool { return pairingPhase(a) == "waiting" })
	p := a.HostPeers().Pairing
	if r.HostID != as.HostID || r.Name != "masa-wsl" || r.UserName != "masa-wsl-user" || p.Code != r.Code || len(r.Code) != 6 || p.HostID != bs.HostID || p.Name != "win-lan" || p.UserName != "win-lan-user" {
		t.Fatalf("request %+v, pairing %+v", r, p)
	}
	if !strings.HasPrefix(r.Addr, "127.0.0.1:") || r.Addr != addrOf(as) {
		t.Fatalf("request addr %q, A listens at %q", r.Addr, addrOf(as))
	}
	userDoes(t, b, "@matomezu/network:pairing-accept", r.ID)
	waitFor(t, "A is told", func() bool { return pairingPhase(a) == "accepted" })
	aPaired, bPaired := a.pairedHostRecords(), b.pairedHostRecords()
	if len(aPaired) != 1 || aPaired[0].HostID != bs.HostID || aPaired[0].Addr != addrOf(bs) || aPaired[0].NameAtPairing != "win-lan" {
		t.Fatalf("A paired %+v", aPaired)
	}
	if len(bPaired) != 1 || bPaired[0].HostID != as.HostID || bPaired[0].Addr != "" {
		t.Fatalf("B paired %+v", bPaired)
	}
	if len(requestsOf(b)) != 0 {
		t.Fatal("the request stays on B")
	}
	waitFor(t, "B knows A", func() bool { return len(b.HostPeers().Paired) == 1 })
	a.CheckPeers()
	waitFor(t, "A sees B connected", func() bool {
		l := a.HostPeers().Paired
		return len(l) == 1 && l[0].Connected && l[0].Name == "win-lan"
	})
}

// B の利用者が断ると A に断りが届き、どちらにも載らない
func TestPairingDeclined(t *testing.T) {
	a, _ := openHost(t, "a")
	b, bs := openHost(t, "b")
	_ = a.StartPairing(addrOf(bs), false)
	waitFor(t, "the request on B", func() bool { return len(requestsOf(b)) == 1 })
	userDoes(t, b, "@matomezu/network:pairing-decline", requestsOf(b)[0].ID)
	waitFor(t, "A is told", func() bool { return pairingPhase(a) == "declined" })
	if len(a.pairedHostRecords()) != 0 || len(b.pairedHostRecords()) != 0 {
		t.Fatal("paired after a decline")
	}
}

// A がやめると、B の頼みが消える
func TestPairingEndedByTheAskerRemovesTheRequest(t *testing.T) {
	a, _ := openHost(t, "a")
	b, bs := openHost(t, "b")
	_ = a.StartPairing(addrOf(bs), false)
	waitFor(t, "the request on B", func() bool { return len(requestsOf(b)) == 1 })
	a.EndPairing()
	waitFor(t, "the request goes", func() bool { return len(requestsOf(b)) == 0 })
	if a.HostPeers().Pairing != nil {
		t.Fatal("the pairing stays on A")
	}
}

// 自分自身には頼めない。届かない所は unreachable
func TestPairingWithItselfOrNobodyIsRefused(t *testing.T) {
	a, as := openHost(t, "a")
	_ = a.StartPairing(addrOf(as), false)
	waitFor(t, "refused", func() bool { return pairingPhase(a) == "refused" })
	if a.HostPeers().Pairing.Reason != "self" {
		t.Fatalf("pairing %+v", a.HostPeers().Pairing)
	}
	ln, _ := net.Listen("tcp", "127.0.0.1:0")
	closed := ln.Addr().String()
	ln.Close()
	_ = a.StartPairing(closed, false)
	waitFor(t, "unreachable", func() bool { return pairingPhase(a) == "unreachable" })
}

func pair(t *testing.T) (a, b *Hub, as, bs HostStatus) {
	t.Helper()
	a, as = openHost(t, "a")
	b, bs = openHost(t, "b")
	_ = a.StartPairing(addrOf(bs), true)
	waitFor(t, "the request on B", func() bool { return len(requestsOf(b)) == 1 })
	userDoes(t, b, "@matomezu/network:pairing-accept", requestsOf(b)[0].ID)
	waitFor(t, "accepted", func() bool { return pairingPhase(a) == "accepted" })
	return a, b, as, bs
}

// A の利用者がペアリングを解くと、B にも知らせ、B の側も消える
func TestUnpairingTellsTheOtherHost(t *testing.T) {
	a, b, _, _ := pair(t)
	waitFor(t, "B knows A's address", func() bool { return len(b.pairedHostRecords()) == 1 })
	userDoes(t, a, "@matomezu/network:paired-host-remove", a.pairedHostRecords()[0].ID)
	waitFor(t, "B unpairs too", func() bool { return len(b.pairedHostRecords()) == 0 })
}

// 片方にだけ載っているとき: 相手が「ペアリングしていない」と答えたら、自分の側も消す
func TestAHostThatAnswersNotPairedIsRemoved(t *testing.T) {
	a, b, _, _ := pair(t)
	// B の側だけを、知らせずに消す（常駐として消す）
	b.dropPairedHost(b.entrance.Load().peers, a.HostStatus().HostID, "for the test")
	waitFor(t, "B forgot", func() bool { return len(b.pairedHostRecords()) == 0 })
	a.CheckPeers()
	waitFor(t, "A removes it", func() bool { return len(a.pairedHostRecords()) == 0 })
}

// ペアリングしていない相手は Pinned の口に通らず、本文は not-paired。ペアリングの頼みの口は commit が無ければ reveal を断る
func TestTheEntranceRefusesStrangers(t *testing.T) {
	_, bs := openHost(t, "b")
	other, err := peer.LoadOrCreate(filepath.Join(t.TempDir(), "other.key"))
	if err != nil {
		t.Fatal(err)
	}
	c := peer.Client(other, bs.HostID, 5*time.Second)
	res, err := c.Get("https://" + addrOf(bs) + "/peer/v1/hello")
	if err != nil {
		t.Fatal(err)
	}
	body := make([]byte, 64)
	n, _ := res.Body.Read(body)
	res.Body.Close()
	if res.StatusCode != http.StatusForbidden || strings.TrimSpace(string(body[:n])) != peer.NotPaired {
		t.Fatalf("hello = %d %q", res.StatusCode, body[:n])
	}
	res, err = c.Post("https://"+addrOf(bs)+peer.PairingPath, "application/json", strings.NewReader(`{"step":"reveal","nonce":"x"}`))
	if err != nil {
		t.Fatal(err)
	}
	res.Body.Close()
	if res.StatusCode != http.StatusConflict {
		t.Fatalf("reveal without commit = %d", res.StatusCode)
	}
}

// 起動し直す前の受け入れ待ちの頼みは、入口を用意するときに消す
func TestLeftoverRequestsAreRemovedAtStart(t *testing.T) {
	h := emptyHub(t)
	put := `{"hostId":"` + strings.Repeat("c", 64) + `","name":"x","userName":"","addr":"1.2.3.4:5","code":"123456"}`
	if out, err := h.Perform(performOne("@matomezu/network:pairing-request-add", json.RawMessage(put), nil)); err != nil || !out.OK {
		t.Fatalf("put = %+v %v", out, err)
	}
	saved := 0
	testHost(t, h, 0, &saved)
	if len(requestsOf(h)) != 0 {
		t.Fatal("the leftover request stays")
	}
}
