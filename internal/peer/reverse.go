package peer

// リバース接続: ホスト A が、ペアリングしたホスト B の入口へ張り続け、B が A への頼みをその上で送る接続。
// A の入口へ B から届かないとき（WSL の NAT の後ろなど）も、A から B へは届くので、B の頼みが A に届く。
// 張る頼みは HTTP/1.1 の Upgrade で受け、101 のあとは役を入れ替える: その接続の中で B が TLS のクライアント、A が TLS のサーバーとして
// もう 1 度 TLS を結び（入れ子の TLS）、A はホストどうしの入口と同じ口を HTTP/2 で答える。相手のホスト id は中の TLS の鍵で決め（RequestHost がそのまま使える）、
// 外の TLS で確かめた相手と違えばつながない

import (
	"bufio"
	"context"
	"crypto/tls"
	"errors"
	"io"
	"net"
	"net/http"
	"strconv"
	"sync"
	"time"

	"golang.org/x/net/http2"
)

// ReversePath は、リバース接続を張る頼みの口
const ReversePath = "/peer/v1/reverse"

// reverseUpgrade は、張る頼みの Upgrade の見出しの値
const reverseUpgrade = "matomezu-reverse"

// 半開きの接続（相手のスリープ・回線の切れで片方だけ残った物）を見つける間合い。
// 中の HTTP/2 は、両方の側が reversePingIdle のあいだ何も読まなければ PING を送り、reversePingWait のうちに返りが無ければ切る。
// 外の TCP の keepalive は、中の PING が届かない形（TCP だけ残る）を OS に見つけさせる
const (
	reversePingIdle = 20 * time.Second
	reversePingWait = 10 * time.Second
	reverseKeepIdle = 30 * time.Second
	reverseKeepGap  = 10 * time.Second
	reverseKeepMax  = 3
	reverseDialWait = 10 * time.Second // 張る頼みの 101 までの上限
)

// DialReverse は、A の側: ホスト expect の入口 addr へリバース接続を張る（101 の答えまで）。ctx が終わると接続も閉じる。
// 相手の包みの断り（版が合わない・ペアリングしていない）は、Client と同じ error（ProtocolMismatchError・ErrNotPaired）で返す
func DialReverse(ctx context.Context, id *Identity, expect string, proto int, addr string) (net.Conn, error) {
	dialer := &net.Dialer{Timeout: reverseDialWait, KeepAliveConfig: net.KeepAliveConfig{Enable: true, Idle: reverseKeepIdle, Interval: reverseKeepGap, Count: reverseKeepMax}}
	tr := &http.Transport{
		TLSClientConfig:       ClientConfig(id, expect),
		DialContext:           dialer.DialContext,
		TLSHandshakeTimeout:   reverseDialWait,
		ResponseHeaderTimeout: reverseDialWait,
		Protocols:             new(http.Protocols),
	}
	tr.Protocols.SetHTTP1(true) // HTTP/2 では Upgrade できない
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, "https://"+addr+ReversePath, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Connection", "Upgrade")
	req.Header.Set("Upgrade", reverseUpgrade)
	resp, err := (&versioned{proto: proto, base: tr}).RoundTrip(req)
	if err != nil {
		return nil, err
	}
	if resp.StatusCode != http.StatusSwitchingProtocols {
		resp.Body.Close()
		return nil, errors.New("peer: the reverse connection was answered " + strconv.Itoa(resp.StatusCode))
	}
	rwc, ok := resp.Body.(io.ReadWriteCloser)
	if !ok {
		resp.Body.Close()
		return nil, errors.New("peer: the reverse connection cannot be written")
	}
	c := &streamConn{ReadWriteCloser: rwc}
	stop := context.AfterFunc(ctx, func() { c.Close() })
	c.after = func() { stop() }
	return c, nil
}

// AcceptReverse は、B の側: リバース接続を張る頼み r を受けて 101 を返し、その接続を返す（中の TLS はまだ結ばない）
func AcceptReverse(w http.ResponseWriter, r *http.Request) (net.Conn, error) {
	if r.Header.Get("Upgrade") != reverseUpgrade {
		http.Error(w, "upgrade to "+reverseUpgrade, http.StatusBadRequest)
		return nil, errors.New("peer: the request does not upgrade")
	}
	hj, ok := w.(http.Hijacker)
	if !ok {
		http.Error(w, "HTTP/1.1 only", http.StatusHTTPVersionNotSupported)
		return nil, errors.New("peer: the request cannot be taken over")
	}
	conn, rw, err := hj.Hijack()
	if err != nil {
		return nil, err
	}
	_ = conn.SetDeadline(time.Time{}) // 入口の http.Server が付けた読みの期限（ReadHeaderTimeout）を外す
	if _, err := rw.WriteString("HTTP/1.1 101 Switching Protocols\r\nConnection: Upgrade\r\nUpgrade: " + reverseUpgrade + "\r\n\r\n"); err == nil {
		err = rw.Flush()
	}
	if err != nil {
		conn.Close()
		return nil, err
	}
	return &bufferedConn{Conn: conn, r: rw.Reader}, nil
}

// ServeReverse は、A の側: 張った接続 conn の中で TLS のサーバーとして相手 expect と TLS を結び、h で答える。接続が切れるか ctx が終わるまで返らない
func ServeReverse(ctx context.Context, conn net.Conn, id *Identity, expect string, h http.Handler) error {
	cfg := ServerConfig(id)
	cfg.NextProtos = []string{http2.NextProtoTLS}
	cfg.VerifyConnection = func(cs tls.ConnectionState) error {
		if len(cs.PeerCertificates) == 0 {
			return errNoCert
		}
		if HostIDOf(cs.PeerCertificates[0]) != expect {
			return ErrKeyMismatch
		}
		return nil
	}
	tc := tls.Server(conn, cfg)
	stop := context.AfterFunc(ctx, func() { conn.Close() })
	defer stop()
	if err := tc.HandshakeContext(ctx); err != nil {
		conn.Close()
		return err
	}
	srv := &http2.Server{ReadIdleTimeout: reversePingIdle, PingTimeout: reversePingWait}
	srv.ServeConn(tc, &http2.ServeConnOpts{Context: ctx, Handler: h})
	conn.Close()
	return nil
}

// ReverseClient は、B の側: 預かった接続 conn の中で TLS のクライアントとして相手 expect と TLS を結び、その上で頼む HTTP のクライアントを返す
// （Client と同じく版を載せ、包みの断りを error にする。URL の番地は使わない）。done は接続が切れたら閉じる
func ReverseClient(ctx context.Context, conn net.Conn, id *Identity, expect string, proto int, timeout time.Duration) (c *http.Client, done <-chan struct{}, err error) {
	cfg := ClientConfig(id, expect)
	cfg.NextProtos = []string{http2.NextProtoTLS}
	nc := &notifyConn{Conn: conn, done: make(chan struct{})}
	tc := tls.Client(nc, cfg)
	if err := tc.HandshakeContext(ctx); err != nil {
		nc.Close()
		return nil, nil, err
	}
	tr := &http2.Transport{ReadIdleTimeout: reversePingIdle, PingTimeout: reversePingWait}
	cc, err := tr.NewClientConn(tc)
	if err != nil {
		nc.Close()
		return nil, nil, err
	}
	return &http.Client{Timeout: timeout, Transport: &versioned{proto: proto, base: cc}}, nc.done, nil
}

// CloseReverse は、ReverseClient で作ったクライアントの接続を閉じる
func CloseReverse(c *http.Client) {
	if v, ok := c.Transport.(*versioned); ok {
		if cc, ok := v.base.(*http2.ClientConn); ok {
			cc.Close()
		}
	}
}

// ReverseOpen は、ReverseClient で作ったクライアントが、まだ新しい頼みを送れるか
func ReverseOpen(c *http.Client) bool {
	if v, ok := c.Transport.(*versioned); ok {
		if cc, ok := v.base.(*http2.ClientConn); ok {
			return cc.CanTakeNewRequest()
		}
	}
	return false
}

// streamConn は、101 の答えの本文（読み書きできる）を net.Conn として使う形。期限は持たない（半開きは中の HTTP/2 の PING と外の keepalive で見つける）
type streamConn struct {
	io.ReadWriteCloser
	once  sync.Once
	after func()
}

func (c *streamConn) Close() error {
	err := c.ReadWriteCloser.Close()
	c.once.Do(func() {
		if c.after != nil {
			c.after()
		}
	})
	return err
}
func (*streamConn) LocalAddr() net.Addr              { return reverseAddr{} }
func (*streamConn) RemoteAddr() net.Addr             { return reverseAddr{} }
func (*streamConn) SetDeadline(time.Time) error      { return nil }
func (*streamConn) SetReadDeadline(time.Time) error  { return nil }
func (*streamConn) SetWriteDeadline(time.Time) error { return nil }

type reverseAddr struct{}

func (reverseAddr) Network() string { return "reverse" }
func (reverseAddr) String() string  { return "reverse" }

// bufferedConn は、乗っ取った接続の、http.Server が読み進めた分を先に読む形
type bufferedConn struct {
	net.Conn
	r *bufio.Reader
}

func (c *bufferedConn) Read(p []byte) (int, error) { return c.r.Read(p) }

// notifyConn は、読みが失敗したか閉じたら done を閉じる形
type notifyConn struct {
	net.Conn
	once sync.Once
	done chan struct{}
}

func (c *notifyConn) Read(p []byte) (int, error) {
	n, err := c.Conn.Read(p)
	if err != nil {
		c.once.Do(func() { close(c.done) })
	}
	return n, err
}

func (c *notifyConn) Close() error {
	err := c.Conn.Close()
	c.once.Do(func() { close(c.done) })
	return err
}
