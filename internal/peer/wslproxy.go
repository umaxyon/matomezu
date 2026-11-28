package peer

// WSLプロキシ: NAT の WSL の常駐が、ホストどうしの入口を開いたときに Windows で立てる matomezu（matomezu wsl-proxy）。
// Windows の LAN の口で待ち、来た接続を TLS を解かずに WSL の常駐の WSLプロキシ専用の受け口へ流す。流す前に頭の 1 行（合い言葉と元の相手の番地）を送る。
// あわせて Windows の LAN で WSL の代わりに mDNS で名乗り、見つけたホストを WSL へ返す。
// WSL とのやり取りは WSLプロキシの標準入力と標準出力の JSON の行で、最初の行どうしで版を確かめ合う。標準入力が閉じたら終わる

import (
	"bufio"
	"context"
	"crypto/rand"
	"crypto/subtle"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/netip"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"
)

// WSLProxyVersion は、WSL と WSLプロキシの間のやり取りの版（行の形を変えたら上げる）
const WSLProxyVersion = 1

const (
	wslHeaderPrefix = "MZWP"           // 頭の行の印（版は最初の行で確かめ合う）
	wslHeaderMax    = 256              // 頭の行の長さの上限
	wslHeaderWait   = 5 * time.Second  // 頭の行を待つ上限
	wslDialWait     = 3 * time.Second  // WSL の受け口へつなぐ上限（受け口の番地ごと）
	wslReadyWait    = 30 * time.Second // WSLプロキシの最初の行を待つ上限
)

// WSLProxyStart は、WSL が WSLプロキシの標準入力の最初の行で渡す物
type WSLProxyStart struct {
	V        int      `json:"v"`
	Secret   string   `json:"secret"`             // 頭の行に載せる使い捨ての合い言葉
	Port     int      `json:"port"`               // Windows の LAN で待つポート（WSL の入口と同じ）
	Targets  []string `json:"targets"`            // WSL の受け口の番地（つながるまで順に試す）
	Advert   Advert   `json:"advert"`             // WSL の代わりに mDNS で名乗る中身
	Discover bool     `json:"discover"`           // mDNS で名乗り、見つける（テストは同じ網に出さないよう切る）
	Loopback bool     `json:"loopback,omitempty"` // 127.0.0.1 だけで待つ（テストは同じ網に出さないよう付ける）
}

// wslToProxy は、最初の行のあとに WSL が送る行
type wslToProxy struct {
	Update *Advert `json:"update,omitempty"` // 名乗る中身を替える
	Query  bool    `json:"query,omitempty"`  // mDNS で今すぐ問う
}

// wslFromProxy は、WSLプロキシが送る行。最初の行は V と Ready か Failed、そのあとは見つけたホストの行
type wslFromProxy struct {
	V        int      `json:"v,omitempty"`
	Ready    bool     `json:"ready,omitempty"`
	Failed   string   `json:"failed,omitempty"` // port-in-use・listen・version
	Addrs    []string `json:"addrs,omitempty"`  // Windows の待っている所の番地
	Sighting *wslSeen `json:"sighting,omitempty"`
}

type wslSeen struct {
	Sighting
	Life float64 `json:"life"` // 残りの寿命（秒）
	Gone bool    `json:"gone,omitempty"`
}

// WSLProxyState は、WSLプロキシの様子（WSL の常駐が窓に見せる）
type WSLProxyState string

const (
	WSLProxyStarting      WSLProxyState = "starting"       // 最初の行を待っている
	WSLProxyRunning       WSLProxyState = "running"        // Windows の LAN で待っている
	WSLProxyUnavailable   WSLProxyState = "unavailable"    // 立たない（Windows に matomezu が無い・古くて wsl-proxy が無い）
	WSLProxyUpdateWindows WSLProxyState = "update-windows" // やり取りの版が合わない（Windows の matomezu が古い）
	WSLProxyUpdateThis    WSLProxyState = "update-this"    // やり取りの版が合わない（この WSL の matomezu が古い）
	WSLProxyPortInUse     WSLProxyState = "port-in-use"    // Windows でそのポートがほかに使われている
	WSLProxyListen        WSLProxyState = "listen"         // Windows で待てない（そのほか）
	WSLProxyStopped       WSLProxyState = "stopped"        // 待ち始めたあとで終わった
)

// RunWSLProxy は、WSLプロキシの受け持ち（matomezu wsl-proxy）。in が閉じるまで流し、名乗る
func RunWSLProxy(in io.Reader, out io.Writer) error {
	lines := bufio.NewScanner(in)
	lines.Buffer(make([]byte, 64*1024), 64*1024)
	if !lines.Scan() {
		return errors.New("no start line")
	}
	var start WSLProxyStart
	if err := json.Unmarshal(lines.Bytes(), &start); err != nil {
		return fmt.Errorf("the start line could not be read: %w", err)
	}
	p := &wslProxy{out: out}
	if start.V != WSLProxyVersion {
		p.write(wslFromProxy{V: WSLProxyVersion, Failed: "version"})
		return fmt.Errorf("WSL speaks version %d, this speaks %d", start.V, WSLProxyVersion)
	}
	bind := ""
	if start.Loopback {
		bind = "127.0.0.1"
	}
	// Windows の 0.0.0.0:P は、WSL の localhost 転送が取る 127.0.0.1:P とぶつからない
	ln, err := net.Listen("tcp4", net.JoinHostPort(bind, strconv.Itoa(start.Port)))
	if err != nil {
		failed := WSLProxyListen
		if errors.Is(err, errAddrInUse) {
			failed = WSLProxyPortInUse
		}
		p.write(wslFromProxy{V: WSLProxyVersion, Failed: string(failed)})
		return err
	}
	defer ln.Close()
	var beacon *Beacon
	if start.Discover {
		if beacon, err = StartBeacon(start.Advert, p.sighted); err != nil {
			fmt.Fprintln(os.Stderr, "wsl-proxy: mDNS could not start:", err) // mDNS が立たなくても流すことはできる
			beacon = nil
		}
	}
	p.write(wslFromProxy{V: WSLProxyVersion, Ready: true, Addrs: ReachableAddrs()})
	go p.accept(ln, start)
	for lines.Scan() {
		var l wslToProxy
		if json.Unmarshal(lines.Bytes(), &l) != nil || beacon == nil {
			continue
		}
		if l.Update != nil {
			beacon.Update(*l.Update)
		}
		if l.Query {
			beacon.Query()
		}
	}
	if beacon != nil {
		beacon.Close()
	}
	return nil
}

type wslProxy struct {
	mu  sync.Mutex
	out io.Writer
}

func (p *wslProxy) write(l wslFromProxy) {
	b, err := json.Marshal(l)
	if err != nil {
		return
	}
	p.mu.Lock()
	defer p.mu.Unlock()
	_, _ = p.out.Write(append(b, '\n'))
}

func (p *wslProxy) sighted(s Sighting, gone bool) {
	seen := &wslSeen{Sighting: s, Gone: gone}
	if !gone {
		seen.Life = time.Until(s.until).Seconds()
	}
	p.write(wslFromProxy{Sighting: seen})
}

func (p *wslProxy) accept(ln net.Listener, start WSLProxyStart) {
	for {
		c, err := ln.Accept()
		if err != nil {
			return
		}
		go func() {
			defer c.Close()
			u, err := dialFirst(start.Targets)
			if err != nil {
				fmt.Fprintln(os.Stderr, "wsl-proxy: no address of WSL answered:", strings.Join(start.Targets, ", "))
				return
			}
			defer u.Close()
			if _, err := io.WriteString(u, wslHeader(start.Secret, c.RemoteAddr().String())); err != nil {
				return
			}
			pipe(c, u)
		}()
	}
}

// dialFirst は、targets のどれにも同時につなぎ、最初につながった物を返す（届かない番地を順に待たない）
func dialFirst(targets []string) (net.Conn, error) {
	type result struct {
		c   net.Conn
		err error
	}
	results := make(chan result, len(targets))
	for _, t := range targets {
		go func() {
			c, err := net.DialTimeout("tcp", t, wslDialWait)
			results <- result{c, err}
		}()
	}
	var last error = errors.New("no address")
	for i := range targets {
		r := <-results
		if r.err != nil {
			last = r.err
			continue
		}
		go func(left int) { // 遅れてつながった物は閉じる
			for range left {
				if r := <-results; r.err == nil {
					_ = r.c.Close()
				}
			}
		}(len(targets) - i - 1)
		return r.c, nil
	}
	return nil, last
}

// pipe は、a と b の間を両方の向きに流す。片方の向きが終わったら、その向きの書き手を半分だけ閉じる（リバース接続のような長い接続にも間合いを設けない）
func pipe(a, b net.Conn) {
	done := make(chan struct{}, 2)
	flow := func(dst, src net.Conn) {
		_, _ = io.Copy(dst, src)
		if cw, ok := dst.(interface{ CloseWrite() error }); ok {
			_ = cw.CloseWrite()
		} else {
			_ = dst.Close()
		}
		done <- struct{}{}
	}
	go flow(a, b)
	go flow(b, a)
	<-done
	<-done
}

func wslHeader(secret, from string) string {
	return wslHeaderPrefix + " " + secret + " " + from + "\n"
}

// newWSLProxySecret は、頭の行に載せる使い捨ての合い言葉
func newWSLProxySecret() string {
	b := make([]byte, 32)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

// readWSLHeader は、頭の行を読み、合い言葉が合えば元の相手の番地を返す。r は頭の行のあとの中身も読む
func readWSLHeader(r *bufio.Reader, secret string) (netip.AddrPort, error) {
	var line []byte
	for {
		b, err := r.ReadByte()
		if err != nil {
			return netip.AddrPort{}, err
		}
		if b == '\n' {
			break
		}
		if len(line) >= wslHeaderMax {
			return netip.AddrPort{}, errors.New("the header line is too long")
		}
		line = append(line, b)
	}
	f := strings.Fields(string(line))
	if len(f) != 3 || f[0] != wslHeaderPrefix {
		return netip.AddrPort{}, errors.New("no header line")
	}
	if subtle.ConstantTimeCompare([]byte(f[1]), []byte(secret)) != 1 {
		return netip.AddrPort{}, errors.New("the secret does not match")
	}
	from, err := netip.ParseAddrPort(f[2])
	if err != nil {
		return netip.AddrPort{}, fmt.Errorf("the address in the header line: %w", err)
	}
	return netip.AddrPortFrom(from.Addr().Unmap(), from.Port()), nil
}

// wslListener は、WSLプロキシ専用の受け口。頭の行の合い言葉が合った接続だけを、元の相手の番地を RemoteAddr にして渡す
type wslListener struct {
	ln     net.Listener
	secret string
	conns  chan net.Conn
	done   chan struct{}
	close  sync.Once
}

func newWSLListener(ln net.Listener, secret string) *wslListener {
	l := &wslListener{ln: ln, secret: secret, conns: make(chan net.Conn), done: make(chan struct{})}
	go l.serve()
	return l
}

func (l *wslListener) serve() {
	for {
		c, err := l.ln.Accept()
		if err != nil {
			l.Close()
			return
		}
		go l.admit(c) // 頭の行の遅い相手が、ほかの接続を待たせない
	}
}

func (l *wslListener) admit(c net.Conn) {
	_ = c.SetReadDeadline(time.Now().Add(wslHeaderWait))
	r := bufio.NewReader(c)
	from, err := readWSLHeader(r, l.secret)
	if err != nil {
		_ = c.Close()
		return
	}
	_ = c.SetReadDeadline(time.Time{})
	hc := &headedConn{Conn: c, r: r, from: net.TCPAddrFromAddrPort(from)}
	select {
	case l.conns <- hc:
	case <-l.done:
		_ = c.Close()
	}
}

func (l *wslListener) Accept() (net.Conn, error) {
	select {
	case c := <-l.conns:
		return c, nil
	case <-l.done:
		return nil, net.ErrClosed
	}
}

func (l *wslListener) Close() error {
	l.close.Do(func() {
		close(l.done)
		_ = l.ln.Close()
	})
	return nil
}

func (l *wslListener) Addr() net.Addr { return l.ln.Addr() }

// headedConn は、頭の行を読んだあとの接続。RemoteAddr は頭の行の元の相手の番地
type headedConn struct {
	net.Conn
	r    *bufio.Reader
	from net.Addr
}

func (c *headedConn) Read(b []byte) (int, error) { return c.r.Read(b) }
func (c *headedConn) RemoteAddr() net.Addr       { return c.from }

// WSLProxyProcess は、立てた WSLプロキシ: 標準入力（閉じると終わる）と標準出力
type WSLProxyProcess struct {
	Stdin  io.WriteCloser
	Stdout io.Reader // 終わったら EOF を返す
}

// WSLProxyLaunch は、WSLプロキシを立てる（Windows の matomezu wsl-proxy。テストは偽の物）
type WSLProxyLaunch func() (WSLProxyProcess, error)

// WSLProxyLink は、WSL の常駐の側から見た WSLプロキシ: 専用の受け口と、WSLプロキシごしの mDNS（Beacon と同じ形）
type WSLProxyLink struct {
	ln       *wslListener
	stdin    io.WriteCloser
	onChange func(s Sighting, gone bool)
	onState  func(st WSLProxyState, addrs []string)

	mu     sync.Mutex
	found  map[string]Sighting
	state  WSLProxyState
	closed bool
	stop   context.CancelFunc
}

// WSLProxyOptions は、StartWSLProxy に渡す物
type WSLProxyOptions struct {
	Port     int    // Windows の LAN で待つポート
	Advert   Advert // WSL の代わりに名乗る中身
	Launch   WSLProxyLaunch
	Discover bool
	Loopback bool
	OnChange func(s Sighting, gone bool)            // WSLプロキシが見つけたホストの知らせ（Beacon の onChange と同じ）
	OnState  func(st WSLProxyState, addrs []string) // 様子が変わったとき（addrs は Windows の待っている所の番地。running のときだけ）
}

// StartWSLProxy は、専用の受け口を開き、WSLプロキシを立てる。最初の行は待たない（様子は OnState で知らせる）
func StartWSLProxy(o WSLProxyOptions) (*WSLProxyLink, error) {
	bind := ""
	if o.Loopback {
		bind = "127.0.0.1"
	}
	raw, err := net.Listen("tcp", net.JoinHostPort(bind, "0"))
	if err != nil {
		return nil, err
	}
	port := strconv.Itoa(raw.Addr().(*net.TCPAddr).Port)
	var targets []string
	if !o.Loopback {
		for _, a := range ReachableAddrs() {
			targets = append(targets, net.JoinHostPort(a, port))
		}
	}
	targets = append(targets, net.JoinHostPort("127.0.0.1", port)) // WSL の localhost 転送
	secret := newWSLProxySecret()
	proc, err := o.Launch()
	if err != nil {
		_ = raw.Close()
		return nil, err
	}
	ctx, stop := context.WithCancel(context.Background())
	l := &WSLProxyLink{ln: newWSLListener(raw, secret), stdin: proc.Stdin, onChange: o.OnChange, onState: o.OnState, found: map[string]Sighting{}, state: WSLProxyStarting, stop: stop}
	start := WSLProxyStart{V: WSLProxyVersion, Secret: secret, Port: o.Port, Targets: targets, Advert: o.Advert, Discover: o.Discover, Loopback: o.Loopback}
	if err := l.send(start); err != nil {
		l.Close()
		return nil, err
	}
	go l.read(ctx, proc.Stdout)
	return l, nil
}

// Listener は、専用の受け口（頭の行を読んだ接続を渡す。TLS は解いていない）
func (l *WSLProxyLink) Listener() net.Listener { return l.ln }

// State は、今の様子
func (l *WSLProxyLink) State() WSLProxyState {
	l.mu.Lock()
	defer l.mu.Unlock()
	return l.state
}

func (l *WSLProxyLink) send(v any) error {
	b, err := json.Marshal(v)
	if err != nil {
		return err
	}
	_, err = l.stdin.Write(append(b, '\n'))
	return err
}

func (l *WSLProxyLink) read(ctx context.Context, out io.Reader) {
	first := make(chan struct{})
	go func() { // 最初の行が来ないまま待ち続けない
		select {
		case <-first:
		case <-ctx.Done():
		case <-time.After(wslReadyWait):
			l.setState(WSLProxyUnavailable, nil)
			l.Close()
		}
	}()
	lines := bufio.NewScanner(out)
	lines.Buffer(make([]byte, 64*1024), 64*1024)
	gotFirst := false
	for lines.Scan() {
		var m wslFromProxy
		if json.Unmarshal(lines.Bytes(), &m) != nil {
			continue // cmd.exe などが混ぜた行
		}
		if !gotFirst {
			if m.V == 0 {
				continue
			}
			gotFirst = true
			close(first)
			switch {
			case m.V < WSLProxyVersion:
				l.setState(WSLProxyUpdateWindows, nil)
			case m.V > WSLProxyVersion:
				l.setState(WSLProxyUpdateThis, nil)
			case m.Ready:
				l.setState(WSLProxyRunning, m.Addrs)
				continue
			case m.Failed != "":
				l.setState(WSLProxyState(m.Failed), nil)
			default:
				l.setState(WSLProxyListen, nil)
			}
			l.Close()
			continue
		}
		if m.Sighting != nil {
			l.sighted(m.Sighting)
		}
	}
	l.mu.Lock()
	clear(l.found) // 様子を知らせる前に消す（知らせを受けた側が読み直す）
	l.mu.Unlock()
	if !gotFirst {
		close(first)
		l.setState(WSLProxyUnavailable, nil)
	} else {
		l.setState(WSLProxyStopped, nil)
	}
	l.Close()
}

// setState は、様子を替えて知らせる。閉じたあと・同じ様子・終わりの様子のあとは知らせない
func (l *WSLProxyLink) setState(st WSLProxyState, addrs []string) {
	l.mu.Lock()
	if l.closed || l.state == st || (l.state != WSLProxyStarting && l.state != WSLProxyRunning) {
		l.mu.Unlock()
		return
	}
	l.state = st
	l.mu.Unlock()
	if l.onState != nil {
		l.onState(st, addrs)
	}
}

func (l *WSLProxyLink) sighted(seen *wslSeen) {
	s := seen.Sighting
	gone := seen.Gone
	if !gone {
		s.until = time.Now().Add(time.Duration(seen.Life * float64(time.Second)))
	}
	l.mu.Lock()
	if l.closed {
		l.mu.Unlock()
		return
	}
	if gone {
		delete(l.found, s.HostID)
	} else {
		l.found[s.HostID] = s
	}
	l.mu.Unlock()
	if l.onChange != nil {
		l.onChange(s, gone)
	}
}

// Update は、名乗る中身を替える
func (l *WSLProxyLink) Update(ad Advert) { _ = l.send(wslToProxy{Update: &ad}) }

// Query は、mDNS で今すぐ問う
func (l *WSLProxyLink) Query() { _ = l.send(wslToProxy{Query: true}) }

// Found は、WSLプロキシが見つけた、寿命の切れていないホスト（ホスト id の順）
func (l *WSLProxyLink) Found() []Sighting {
	l.mu.Lock()
	defer l.mu.Unlock()
	return liveSightings(l.found)
}

// Close は、WSLプロキシを終わらせ（標準入力を閉じる）、専用の受け口を閉じる。待たない
func (l *WSLProxyLink) Close() {
	l.mu.Lock()
	if l.closed {
		l.mu.Unlock()
		return
	}
	l.closed = true
	l.mu.Unlock()
	l.stop()
	_ = l.stdin.Close()
	_ = l.ln.Close()
}
