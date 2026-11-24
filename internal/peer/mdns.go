package peer

// mDNS（RFC 6762・6763）で、同じ網のホストに自分を知らせ、知らせているホストを見つける（Beacon）。
// 受け口は 224.0.0.251:5353 に結ぶ（Mac は、結んだ番地と宛て先が違う文を渡さないため。OS の mDNS と同じポートを分け合う）。
// 送るときは、マルチキャストの出来るインターフェースごとに出す。見つけた物の身元は TXT の申告にすぎず、つなぐときに TLS の鍵で確かめる

import (
	"context"
	"errors"
	"math/rand/v2"
	"net"
	"slices"
	"strconv"
	"strings"
	"sync"
	"time"

	"golang.org/x/net/dns/dnsmessage"
	"golang.org/x/net/ipv4"
)

// ServiceName は、matomezu のホストが知らせる DNS-SD のサービスの名前
const ServiceName = "_matomezu._tcp.local."

const (
	mdnsTTL        = 120 // 知らせる物の寿命（秒）
	cacheFlush     = 0x8000
	beaconInterval = 5 * time.Second // 自分の番地の変わりとスリープからの戻りを見る間
)

var mdnsGroup = &net.UDPAddr{IP: net.IPv4(224, 0, 0, 251), Port: 5353}

// Advert は、自分を知らせる中身
type Advert struct {
	HostID   string
	Protocol int // 約束の版
	Port     int
	Name     string // ホスト名
	UserName string // 利用者名
}

// Sighting は、mDNS で見つけたホスト（申告のまま）
type Sighting struct {
	HostID   string
	Protocol int
	Name     string
	UserName string
	Addr     string   // 文が来た番地（いちばん届きそうな番地）
	Addrs    []string // 相手が知らせた番地
	Port     int
	until    time.Time
}

// Beacon は、自分を知らせ、ほかのホストを見つける mDNS の受け持ち
type Beacon struct {
	conn     *net.UDPConn
	pc       *ipv4.PacketConn
	onChange func(s Sighting, gone bool)

	sendMu sync.Mutex
	mu     sync.Mutex
	self   Advert
	addrs  []string
	found  map[string]Sighting
	stop   context.CancelFunc
	done   chan struct{}
	close  sync.Once
}

// StartBeacon は、5353 で待ち始め、自分を知らせる。onChange は、ほかのホストの知らせが届くたび（gone は「いなくなる」）に、受けの goroutine から呼ぶ
func StartBeacon(self Advert, onChange func(s Sighting, gone bool)) (*Beacon, error) {
	conn, err := net.ListenMulticastUDP("udp4", nil, mdnsGroup)
	if err != nil {
		return nil, err
	}
	pc := ipv4.NewPacketConn(conn)
	for _, ifc := range multicastInterfaces() {
		_ = pc.JoinGroup(&ifc, mdnsGroup) // 既定のインターフェースは ListenMulticastUDP が入れている
	}
	_ = pc.SetMulticastLoopback(true)
	_ = pc.SetMulticastTTL(255)
	ctx, stop := context.WithCancel(context.Background())
	b := &Beacon{conn: conn, pc: pc, onChange: onChange, self: self, addrs: ReachableAddrs(), found: map[string]Sighting{}, stop: stop, done: make(chan struct{})}
	go b.receive()
	go b.watch(ctx)
	b.announce()
	b.Query()
	return b, nil
}

// Update は、知らせる中身を替えて知らせ直す
func (b *Beacon) Update(self Advert) {
	b.mu.Lock()
	b.self = self
	b.mu.Unlock()
	b.announce()
}

// Query は、知らせているホストに今すぐ答えるよう問う
func (b *Beacon) Query() {
	msg, err := buildQuery()
	if err == nil {
		b.send(msg)
	}
}

// Found は、寿命の切れていない見つけたホスト（ホスト id の順）
func (b *Beacon) Found() []Sighting {
	b.mu.Lock()
	defer b.mu.Unlock()
	now := time.Now()
	var out []Sighting
	for id, s := range b.found {
		if now.After(s.until) {
			delete(b.found, id)
			continue
		}
		out = append(out, s)
	}
	slices.SortFunc(out, func(a, c Sighting) int { return strings.Compare(a.HostID, c.HostID) })
	return out
}

// Close は、「いなくなる」を知らせて止める
func (b *Beacon) Close() {
	b.close.Do(b.goodbye)
}

func (b *Beacon) goodbye() {
	b.stop()
	b.mu.Lock()
	self, addrs := b.self, b.addrs
	b.mu.Unlock()
	if msg, err := buildAnswer(self, addrs, 0); err == nil {
		b.send(msg)
	}
	_ = b.conn.Close()
	<-b.done
}

// announce は、自分を 2 回（1 秒あけて）知らせる（RFC 6762 の 8.3）
func (b *Beacon) announce() {
	b.answer()
	time.AfterFunc(time.Second, b.answer)
}

func (b *Beacon) answer() {
	b.mu.Lock()
	self, addrs := b.self, b.addrs
	b.mu.Unlock()
	if msg, err := buildAnswer(self, addrs, mdnsTTL); err == nil {
		b.send(msg)
	}
}

// send は、マルチキャストの出来るインターフェースごとに出す
func (b *Beacon) send(msg []byte) {
	b.sendMu.Lock()
	defer b.sendMu.Unlock()
	for _, ifc := range multicastInterfaces() {
		if b.pc.SetMulticastInterface(&ifc) != nil {
			continue
		}
		_, _ = b.pc.WriteTo(msg, nil, mdnsGroup)
	}
}

// watch は、自分の番地が変わったときと、スリープから戻ったとき（時計が間より大きく進んだとき）に知らせ直す
func (b *Beacon) watch(ctx context.Context) {
	t := time.NewTicker(beaconInterval)
	defer t.Stop()
	last := time.Now()
	for {
		select {
		case <-ctx.Done():
			return
		case now := <-t.C:
			woke := now.Sub(last) > 3*beaconInterval
			last = now
			addrs := ReachableAddrs()
			b.mu.Lock()
			moved := !slices.Equal(addrs, b.addrs)
			b.addrs = addrs
			b.mu.Unlock()
			if moved || woke {
				b.announce()
				b.Query()
			}
		}
	}
}

func (b *Beacon) receive() {
	defer close(b.done)
	buf := make([]byte, 9000)
	for {
		n, from, err := b.conn.ReadFromUDP(buf)
		if err != nil {
			if errors.Is(err, net.ErrClosed) {
				return
			}
			continue
		}
		b.handle(buf[:n], from.IP.String())
	}
}

func (b *Beacon) handle(msg []byte, from string) {
	asked, sightings, err := parseMessage(msg, from)
	if err != nil {
		return
	}
	if asked {
		// 同じ問いに何台もが一斉に答えて混まないよう、20〜120 ms ずらす（RFC 6762 の 6）
		time.AfterFunc(time.Duration(20+rand.IntN(100))*time.Millisecond, b.answer)
	}
	b.mu.Lock()
	selfID := b.self.HostID
	b.mu.Unlock()
	for _, s := range sightings {
		if s.HostID == selfID {
			continue
		}
		gone := s.until.IsZero()
		b.mu.Lock()
		if gone {
			delete(b.found, s.HostID)
		} else {
			b.found[s.HostID] = s
		}
		b.mu.Unlock()
		if b.onChange != nil {
			b.onChange(s, gone)
		}
	}
}

// multicastInterfaces は、上がっていて、マルチキャストが出来て、IPv4 の番地を持つインターフェース（ループバックを除く）
func multicastInterfaces() []net.Interface {
	ifaces, err := net.Interfaces()
	if err != nil {
		return nil
	}
	var out []net.Interface
	for _, ifc := range ifaces {
		if ifc.Flags&net.FlagUp == 0 || ifc.Flags&net.FlagMulticast == 0 || ifc.Flags&net.FlagLoopback != 0 {
			continue
		}
		addrs, _ := ifc.Addrs()
		for _, a := range addrs {
			if ipn, ok := a.(*net.IPNet); ok && ipn.IP.To4() != nil {
				out = append(out, ifc)
				break
			}
		}
	}
	return out
}

// instanceLabel は、DNS-SD のインスタンスの名前（ホスト id の頭 16 字。ホスト名は TXT に載せるので、名前がぶつからない）
func instanceLabel(hostID string) string {
	if len(hostID) > 16 {
		hostID = hostID[:16]
	}
	return "mz-" + hostID
}

func buildQuery() ([]byte, error) {
	name, err := dnsmessage.NewName(ServiceName)
	if err != nil {
		return nil, err
	}
	bld := dnsmessage.NewBuilder(nil, dnsmessage.Header{})
	if err := bld.StartQuestions(); err != nil {
		return nil, err
	}
	if err := bld.Question(dnsmessage.Question{Name: name, Type: dnsmessage.TypePTR, Class: dnsmessage.ClassINET}); err != nil {
		return nil, err
	}
	return bld.Finish()
}

// buildAnswer は、自分を知らせる文（PTR と、SRV・TXT・A）。ttl が 0 なら「いなくなる」
func buildAnswer(self Advert, addrs []string, ttl uint32) ([]byte, error) {
	label := instanceLabel(self.HostID)
	service, err := dnsmessage.NewName(ServiceName)
	if err != nil {
		return nil, err
	}
	instance, err := dnsmessage.NewName(label + "." + ServiceName)
	if err != nil {
		return nil, err
	}
	target, err := dnsmessage.NewName(label + ".local.")
	if err != nil {
		return nil, err
	}
	bld := dnsmessage.NewBuilder(nil, dnsmessage.Header{Response: true, Authoritative: true})
	bld.EnableCompression()
	if err := bld.StartAnswers(); err != nil {
		return nil, err
	}
	shared := dnsmessage.ResourceHeader{Name: service, Class: dnsmessage.ClassINET, TTL: ttl}
	if err := bld.PTRResource(shared, dnsmessage.PTRResource{PTR: instance}); err != nil {
		return nil, err
	}
	if err := bld.StartAdditionals(); err != nil {
		return nil, err
	}
	unique := func(n dnsmessage.Name) dnsmessage.ResourceHeader {
		return dnsmessage.ResourceHeader{Name: n, Class: dnsmessage.ClassINET | cacheFlush, TTL: ttl}
	}
	if err := bld.SRVResource(unique(instance), dnsmessage.SRVResource{Target: target, Port: uint16(self.Port)}); err != nil {
		return nil, err
	}
	txt := []string{"v=" + strconv.Itoa(self.Protocol), "id=" + self.HostID, "n=" + clip(self.Name), "u=" + clip(self.UserName)}
	if err := bld.TXTResource(unique(instance), dnsmessage.TXTResource{TXT: txt}); err != nil {
		return nil, err
	}
	for _, a := range addrs {
		ip := net.ParseIP(a).To4()
		if ip == nil {
			continue
		}
		if err := bld.AResource(unique(target), dnsmessage.AResource{A: [4]byte(ip)}); err != nil {
			return nil, err
		}
	}
	return bld.Finish()
}

// clip は、TXT の 1 つ（255 バイトまで）に入るよう、頭の 200 バイトまでに切る（文字の途中では切らない）
func clip(s string) string {
	if len(s) <= 200 {
		return s
	}
	cut := 200
	for cut > 0 && !utf8Start(s[cut]) {
		cut--
	}
	return s[:cut]
}

func utf8Start(c byte) bool { return c&0xC0 != 0x80 }

// parseMessage は、届いた文を読む。asked は matomezu のサービスを問う文か。sightings は答えの中の matomezu のホスト（いなくなる物は until が零）
func parseMessage(msg []byte, from string) (asked bool, sightings []Sighting, err error) {
	var p dnsmessage.Parser
	h, err := p.Start(msg)
	if err != nil {
		return false, nil, err
	}
	qs, err := p.AllQuestions()
	if err != nil {
		return false, nil, err
	}
	if !h.Response {
		for _, q := range qs {
			if strings.EqualFold(q.Name.String(), ServiceName) && (q.Type == dnsmessage.TypePTR || q.Type == dnsmessage.TypeALL) {
				asked = true
			}
		}
		return asked, nil, nil
	}
	type instanceInfo struct {
		ttl    uint32
		target string
		port   int
		txt    []string
	}
	instances := map[string]*instanceInfo{}
	hostAddrs := map[string][]string{}
	get := func(name string) *instanceInfo {
		if instances[name] == nil {
			instances[name] = &instanceInfo{}
		}
		return instances[name]
	}
	read := func(rh dnsmessage.ResourceHeader, skip func() error) error {
		name := strings.ToLower(rh.Name.String())
		switch rh.Type {
		case dnsmessage.TypePTR:
			r, err := p.PTRResource()
			if err != nil {
				return err
			}
			if name == ServiceName {
				get(strings.ToLower(r.PTR.String())).ttl = rh.TTL
			}
		case dnsmessage.TypeSRV:
			r, err := p.SRVResource()
			if err != nil {
				return err
			}
			i := get(name)
			i.target, i.port = strings.ToLower(r.Target.String()), int(r.Port)
		case dnsmessage.TypeTXT:
			r, err := p.TXTResource()
			if err != nil {
				return err
			}
			get(name).txt = r.TXT
		case dnsmessage.TypeA:
			r, err := p.AResource()
			if err != nil {
				return err
			}
			hostAddrs[name] = append(hostAddrs[name], net.IP(r.A[:]).String())
		default:
			return skip()
		}
		return nil
	}
	for {
		rh, err := p.AnswerHeader()
		if errors.Is(err, dnsmessage.ErrSectionDone) {
			break
		}
		if err != nil {
			return false, nil, err
		}
		if err := read(rh, p.SkipAnswer); err != nil {
			return false, nil, err
		}
	}
	if err := p.SkipAllAuthorities(); err != nil {
		return false, nil, err
	}
	for {
		rh, err := p.AdditionalHeader()
		if errors.Is(err, dnsmessage.ErrSectionDone) {
			break
		}
		if err != nil {
			return false, nil, err
		}
		if err := read(rh, p.SkipAdditional); err != nil {
			return false, nil, err
		}
	}
	for name, i := range instances {
		if !strings.HasSuffix(name, "."+ServiceName) {
			continue
		}
		s := Sighting{Addr: from, Port: i.port, Addrs: hostAddrs[i.target]}
		for _, kv := range i.txt {
			k, v, _ := strings.Cut(kv, "=")
			switch k {
			case "v":
				s.Protocol, _ = strconv.Atoi(v)
			case "id":
				s.HostID = v
			case "n":
				s.Name = v
			case "u":
				s.UserName = v
			}
		}
		if s.HostID == "" {
			continue
		}
		if i.ttl > 0 {
			s.until = time.Now().Add(time.Duration(i.ttl) * time.Second)
		}
		sightings = append(sightings, s)
	}
	return false, sightings, nil
}
