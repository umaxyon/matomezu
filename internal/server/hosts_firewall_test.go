package server

import (
	"errors"
	"net"
	"path/filepath"
	"sync"
	"testing"

	"github.com/umaxyon/matomezu/internal/firewall"
	"github.com/umaxyon/matomezu/internal/peer"
)

// fakeFirewall は、Windows のファイアウォールの規則の作り物（ポートごとに 3 本そろうか無いか）
type fakeFirewall struct {
	mu          sync.Mutex
	allowed     map[int]bool
	refuse      bool // UAC が通らない（許可・付け替えを断る）
	refuseDeny  bool // 取り消しを断る
	ineffective bool // 保存した規則が効かない（PC の設定）
	elevated    int  // Allow・Deny・Move を呼んだ回数（UAC の回数）
	reads       int
	hold        chan struct{} // nil でなければ、Read は閉じるまで返らない（読みが遅れて着くのを作る）
}

func newFakeFirewall() *fakeFirewall { return &fakeFirewall{allowed: map[int]bool{}} }

func (f *fakeFirewall) Read() (firewall.Reading, error) {
	f.mu.Lock()
	f.reads++
	hold := f.hold
	r := f.reading()
	f.mu.Unlock()
	if hold != nil {
		<-hold // 読み始めたときの規則を返す
	}
	return r, nil
}

func (f *fakeFirewall) reading() firewall.Reading {
	var r firewall.Reading
	for port := range f.allowed {
		rules := []firewall.Rule{
			{Name: firewall.TCPBlockRuleName(port), Enabled: true, Action: "Block"},
			{Name: firewall.TCPRuleName(port), Enabled: true, Action: "Allow"},
			{Name: firewall.MDNSRuleName, Enabled: true, Action: "Allow"},
		}
		r.Persistent = append(r.Persistent, rules...)
		if !f.ineffective {
			r.Active = append(r.Active, rules...)
		}
	}
	return r
}

func (f *fakeFirewall) Allow(port int) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.elevated++
	if f.refuse {
		return errors.New("the user refused")
	}
	f.allowed[port] = true
	return nil
}

func (f *fakeFirewall) Deny(port int) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.elevated++
	if f.refuseDeny {
		return errors.New("the user refused")
	}
	delete(f.allowed, port)
	return nil
}

func (f *fakeFirewall) Move(from, to int) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.elevated++
	if f.refuse {
		return errors.New("the user refused")
	}
	f.allowed[to] = true
	delete(f.allowed, from)
	return nil
}

func (f *fakeFirewall) count() (elevated, reads int) {
	f.mu.Lock()
	defer f.mu.Unlock()
	return f.elevated, f.reads
}

func (f *fakeFirewall) set(change func(*fakeFirewall)) {
	f.mu.Lock()
	defer f.mu.Unlock()
	change(f)
}

// firewallHost は、ファイアウォールの作り物を差した入口を hub に用意する（127.0.0.1 だけで待つ）
func firewallHost(t *testing.T, h *Hub, port int, saved *int, f *fakeFirewall) {
	t.Helper()
	id, err := peer.LoadOrCreate(filepath.Join(t.TempDir(), "host.key"))
	if err != nil {
		t.Fatal(err)
	}
	h.SetHostEntrance(HostConfig{
		Identity:   id,
		Port:       port,
		SavePort:   func(p int) error { *saved = p; return nil },
		OSHostName: "desk",
		Loopback:   true,
		Firewall:   f,
	})
	cleanup(t, h.CloseHostEntrance)
}

// ファイアウォールで許可するまで開かない。許可すれば覚えたポートで開き、取り消せば閉じる。つなぐが切なら様子を見せない
func TestTheHostEntranceOpensOnlyWhileTheFirewallAllows(t *testing.T) {
	t.Parallel()
	h := emptyHub(t)
	saved := 0
	f := newFakeFirewall()
	firewallHost(t, h, 0, &saved, f)
	setHostSettings(t, h, `{"@matomezu/network:connect-hosts":true}`)
	if s := waitHost(t, h, func(s HostStatus) bool { return s.Firewall != "" }); s.Open || s.Firewall != firewall.Absent || saved == 0 {
		t.Fatalf("not allowed = %+v, saved %d", s, saved)
	}
	// 立ったとき・設定を変えたときは UAC を出さず、読み直しもしない
	setHostSettings(t, h, `{"@matomezu/network:connect-hosts":true,"@matomezu/network:host-name":"x"}`)
	waitHost(t, h, func(s HostStatus) bool { return s.Name == "x" })
	if elevated, reads := f.count(); elevated != 0 || reads != 1 {
		t.Fatalf("before pressing: %d UAC, %d reads", elevated, reads)
	}
	if err := h.SetFirewall(true); err != nil {
		t.Fatal(err)
	}
	s := waitHost(t, h, func(s HostStatus) bool { return s.Open })
	if elevated, _ := f.count(); s.Firewall != firewall.Allowed || s.Port != saved || !f.allowed[saved] || elevated != 1 {
		t.Fatalf("allowed = %+v, saved %d, %d UAC", s, saved, elevated)
	}
	if err := h.SetFirewall(false); err != nil {
		t.Fatal(err)
	}
	if s := waitHost(t, h, func(s HostStatus) bool { return !s.Open }); s.Firewall != firewall.Absent || len(f.allowed) != 0 {
		t.Fatalf("denied = %+v", s)
	}
	setHostSettings(t, h, `{"@matomezu/network:connect-hosts":false}`)
	if s := waitHost(t, h, func(s HostStatus) bool { return s.Firewall == "" }); s.Open {
		t.Fatalf("off = %+v", s)
	}
}

// 許可しようとして規則がそろわなければ（UAC が通らない・PC の設定で効かない）、効かない様子にして開かない。試し直して通れば開く
func TestTheHostEntranceShowsWhenTheFirewallCannotAllow(t *testing.T) {
	t.Parallel()
	h := emptyHub(t)
	saved := 0
	f := newFakeFirewall()
	f.refuse = true
	firewallHost(t, h, 0, &saved, f)
	setHostSettings(t, h, `{"@matomezu/network:connect-hosts":true}`)
	waitHost(t, h, func(s HostStatus) bool { return s.Firewall == firewall.Absent })
	if err := h.SetFirewall(true); err != nil {
		t.Fatal(err)
	}
	if s := waitHost(t, h, func(s HostStatus) bool { return s.Firewall == firewall.Ineffective }); s.Open {
		t.Fatalf("refused = %+v", s)
	}
	f.set(func(f *fakeFirewall) { f.refuse, f.ineffective = false, true })
	if err := h.SetFirewall(true); err != nil {
		t.Fatal(err)
	}
	if s := waitHost(t, h, func(s HostStatus) bool { return s.Firewall == firewall.Ineffective }); s.Open {
		t.Fatalf("not in effect = %+v", s)
	}
	f.set(func(f *fakeFirewall) { f.ineffective = false })
	if err := h.SetFirewall(true); err != nil {
		t.Fatal(err)
	}
	if s := waitHost(t, h, func(s HostStatus) bool { return s.Open }); s.Firewall != firewall.Allowed {
		t.Fatalf("allowed = %+v", s)
	}
}

// 取り消せなければ、許可のまま開いている
func TestTheHostEntranceStaysOpenWhenTheRulesCannotBeRemoved(t *testing.T) {
	t.Parallel()
	h := emptyHub(t)
	saved := 0
	f := newFakeFirewall()
	firewallHost(t, h, 0, &saved, f)
	setHostSettings(t, h, `{"@matomezu/network:connect-hosts":true}`)
	waitHost(t, h, func(s HostStatus) bool { return s.Firewall == firewall.Absent })
	if err := h.SetFirewall(true); err != nil {
		t.Fatal(err)
	}
	waitHost(t, h, func(s HostStatus) bool { return s.Open })
	f.set(func(f *fakeFirewall) { f.refuseDeny = true })
	if err := h.SetFirewall(false); err != nil {
		t.Fatal(err)
	}
	if s := waitHost(t, h, func(s HostStatus) bool { return s.Firewall == firewall.Allowed }); !s.Open {
		t.Fatalf("after the refused removal = %+v", s)
	}
}

// 許可したポートがほかに使われているとき、選び直すと規則を空いている番号へ付け替えて開く。付け替えが通らなければポートを変えず、効かない様子にする
func TestRepickingTheHostPortMovesTheFirewallRules(t *testing.T) {
	t.Parallel()
	taken, err := net.Listen("tcp4", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer taken.Close()
	kept := taken.Addr().(*net.TCPAddr).Port
	h := emptyHub(t)
	saved := 0
	f := newFakeFirewall()
	f.allowed[kept] = true
	f.refuse = true
	firewallHost(t, h, kept, &saved, f)
	setHostSettings(t, h, `{"@matomezu/network:connect-hosts":true}`)
	waitHost(t, h, func(s HostStatus) bool { return s.Failed == HostPortInUse && s.Firewall == firewall.Allowed })
	if err := h.RepickHostPort(); err != nil {
		t.Fatal(err)
	}
	if s := waitHost(t, h, func(s HostStatus) bool { return s.Firewall == firewall.Ineffective }); s.Open || saved != 0 || !f.allowed[kept] {
		t.Fatalf("refused = %+v, saved %d", s, saved)
	}
	f.set(func(f *fakeFirewall) { f.refuse = false })
	if err := h.SetFirewall(true); err != nil {
		t.Fatal(err)
	}
	waitHost(t, h, func(s HostStatus) bool { return s.Failed == HostPortInUse && s.Firewall == firewall.Allowed })
	if err := h.RepickHostPort(); err != nil {
		t.Fatal(err)
	}
	s := waitHost(t, h, func(s HostStatus) bool { return s.Open })
	if s.Port == kept || saved != s.Port || s.Firewall != firewall.Allowed || f.allowed[kept] || !f.allowed[s.Port] {
		t.Fatalf("moved = %+v, saved %d, kept %d", s, saved, kept)
	}
}

// waitReads は、規則を n 回読み終えるまで待つ
func waitReads(t *testing.T, f *fakeFirewall, n int) {
	t.Helper()
	waitFor(t, "the firewall reads", func() bool { _, reads := f.count(); return reads >= n })
}

// 規則を変える前に始まった読みが遅れて着いても、変えたあとの様子を上書きしない
func TestAnOldReadingDoesNotOverwriteTheFirewallChange(t *testing.T) {
	t.Parallel()
	h := emptyHub(t)
	saved := 0
	f := newFakeFirewall()
	firewallHost(t, h, 0, &saved, f)
	setHostSettings(t, h, `{"@matomezu/network:connect-hosts":true}`)
	waitHost(t, h, func(s HostStatus) bool { return s.Firewall == firewall.Absent })
	hold := make(chan struct{})
	f.set(func(f *fakeFirewall) { f.hold = hold })
	h.CheckPeers() // 開け閉めの goroutine が読み始め、止まる
	waitReads(t, f, 2)
	allowed := make(chan error, 1)
	go func() { allowed <- h.SetFirewall(true) }()
	waitFor(t, "the allowance", func() bool { elevated, reads := f.count(); return elevated == 1 && reads == 3 }) // 許可して読み直しに入った
	f.set(func(f *fakeFirewall) { f.hold = nil })
	close(hold)
	if err := <-allowed; err != nil {
		t.Fatal(err)
	}
	if s := waitHost(t, h, func(s HostStatus) bool { return s.Open }); s.Firewall != firewall.Allowed {
		t.Fatalf("allowed = %+v", s)
	}
}
