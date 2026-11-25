package peer

import (
	"strings"
	"testing"
	"time"
)

var testAdvert = Advert{HostID: strings.Repeat("ab", 32), Protocol: Protocol, Port: 7240, Name: "masa-wsl", UserName: "あなた"}

func TestTheAnswerReadsBackAsASighting(t *testing.T) {
	msg, err := buildAnswer(testAdvert, []string{"192.168.11.11", "10.0.0.2"}, mdnsTTL)
	if err != nil {
		t.Fatal(err)
	}
	asked, got, err := parseMessage(msg, "192.168.11.11")
	if err != nil || asked || len(got) != 1 {
		t.Fatalf("asked %v, %d sightings, err %v", asked, len(got), err)
	}
	s := got[0]
	if s.HostID != testAdvert.HostID || s.Name != "masa-wsl" || s.UserName != "あなた" || s.Port != 7240 || s.Protocol != Protocol || s.Addr != "192.168.11.11" {
		t.Fatalf("sighting %+v", s)
	}
	if strings.Join(s.Addrs, ",") != "192.168.11.11,10.0.0.2" || s.until.IsZero() {
		t.Fatalf("addrs %v, until %v", s.Addrs, s.until)
	}
}

func TestAGoodbyeReadsBackAsGone(t *testing.T) {
	msg, err := buildAnswer(testAdvert, []string{"192.168.11.11"}, 0)
	if err != nil {
		t.Fatal(err)
	}
	_, got, err := parseMessage(msg, "192.168.11.11")
	if err != nil || len(got) != 1 || !got[0].until.IsZero() {
		t.Fatalf("%+v %v", got, err)
	}
}

func TestTheQueryIsAsked(t *testing.T) {
	msg, err := buildQuery()
	if err != nil {
		t.Fatal(err)
	}
	asked, got, err := parseMessage(msg, "192.168.11.11")
	if err != nil || !asked || len(got) != 0 {
		t.Fatalf("asked %v, %d sightings, err %v", asked, len(got), err)
	}
}

func TestALongNameIsCutAtACharacter(t *testing.T) {
	s := clip(strings.Repeat("あ", 100)) // 300 バイト
	if len(s) > 200 || !strings.HasPrefix(strings.Repeat("あ", 100), s) || len(s)%3 != 0 {
		t.Fatalf("%d bytes", len(s))
	}
}

// 同じマシンの 2 つの Beacon が、マルチキャストの折り返しで互いを見つけ、閉じると「いなくなる」が届く
func TestTwoBeaconsFindEachOther(t *testing.T) {
	if len(multicastInterfaces()) == 0 {
		t.Skip("no multicast interface")
	}
	type event struct {
		s    Sighting
		gone bool
	}
	events := make(chan event, 32)
	a, err := StartBeacon(Advert{HostID: strings.Repeat("a", 64), Protocol: Protocol, Port: 1, Name: "a"}, nil)
	if err != nil {
		t.Skip("cannot listen on 5353:", err)
	}
	defer a.Close()
	b, err := StartBeacon(Advert{HostID: strings.Repeat("b", 64), Protocol: Protocol, Port: 2, Name: "b"}, func(s Sighting, gone bool) { events <- event{s, gone} })
	if err != nil {
		t.Skip("cannot listen on 5353 twice:", err)
	}
	defer b.Close()
	wait := func(want func(event) bool) {
		t.Helper()
		deadline := time.After(5 * time.Second)
		for {
			select {
			case e := <-events:
				if want(e) {
					return
				}
			case <-deadline:
				t.Fatal("not seen")
			}
		}
	}
	// 同じ LAN で入口を開いている本物の常駐も見えるので、テストのホストだけを見る
	ours := func() (f []Sighting) {
		for _, s := range b.Found() {
			if s.HostID == strings.Repeat("a", 64) {
				f = append(f, s)
			}
		}
		return f
	}
	wait(func(e event) bool { return e.s.HostID == strings.Repeat("a", 64) && !e.gone && e.s.Port == 1 })
	if f := ours(); len(f) != 1 || f[0].Name != "a" {
		t.Fatalf("found %+v", f)
	}
	a.Close()
	wait(func(e event) bool { return e.s.HostID == strings.Repeat("a", 64) && e.gone })
	if f := ours(); len(f) != 0 {
		t.Fatalf("found after goodbye %+v", f)
	}
}
