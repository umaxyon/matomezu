package peer

import (
	"bytes"
	"crypto/tls"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"strconv"
	"strings"
	"time"
)

// ホストどうしの TLS: 両方が自分の鍵の証明書を見せ合う（TLS 1.3 だけ）。証明書の発行者や期限は見ず、相手の公開鍵から決まるホスト id だけで相手を確かめる。
// 確かめは VerifyConnection で行う（VerifyPeerCertificate は、つなぎ直しで省かれることがあるため）

// ServerConfig は、ホストどうしの入口の TLS の設定。相手の証明書は必ず受け取り、どのホスト id を受けるかは包み（Pinned・Unpinned）が決める
func ServerConfig(id *Identity) *tls.Config {
	return &tls.Config{
		MinVersion:             tls.VersionTLS13,
		Certificates:           []tls.Certificate{id.Cert},
		ClientAuth:             tls.RequireAnyClientCert,
		SessionTicketsDisabled: true,
		VerifyConnection: func(cs tls.ConnectionState) error {
			if len(cs.PeerCertificates) == 0 {
				return errNoCert
			}
			return nil
		},
	}
}

// ClientConfig は、ほかのホストの入口へつなぐ TLS の設定。expect が空でなければ、相手のホスト id が expect でなければつながない（鍵の固定）。
// 空なら、どの鍵の相手ともつなぐ（ペアリングの頼みだけ）
func ClientConfig(id *Identity, expect string) *tls.Config {
	return &tls.Config{
		MinVersion:         tls.VersionTLS13,
		Certificates:       []tls.Certificate{id.Cert},
		InsecureSkipVerify: true, // 発行者で確かめないため。相手は下の VerifyConnection でホスト id で確かめる
		VerifyConnection: func(cs tls.ConnectionState) error {
			if len(cs.PeerCertificates) == 0 {
				return errNoCert
			}
			if expect != "" && HostIDOf(cs.PeerCertificates[0]) != expect {
				return ErrKeyMismatch
			}
			return nil
		},
	}
}

var errNoCert = errors.New("peer: no certificate")

// ErrKeyMismatch は、相手の鍵が覚えた鍵と合わないこと
var ErrKeyMismatch = errors.New("peer: the host key does not match")

// Client は、ほかのホストの入口へ頼む HTTP のクライアント（expect は ClientConfig と同じ）。どの頼みにも常駐間通信プロトコルの版 proto を見出し ProtocolHeader で載せ、
// 相手の包みの断り（版が合わない・ペアリングしていない）は、答えでなく error（ProtocolMismatchError・ErrNotPaired）で返す
func Client(id *Identity, expect string, proto int, timeout time.Duration) *http.Client {
	return &http.Client{
		Timeout: timeout,
		Transport: &versioned{proto: proto, base: &http.Transport{
			TLSClientConfig:   ClientConfig(id, expect),
			ForceAttemptHTTP2: true,
			DialContext:       (&net.Dialer{Timeout: timeout}).DialContext,
		}},
	}
}

// versioned は、頼みに常駐間通信プロトコルの版を載せ、包みの断りを error にする RoundTripper
type versioned struct {
	proto int
	base  http.RoundTripper
}

func (v *versioned) RoundTrip(req *http.Request) (*http.Response, error) {
	req = req.Clone(req.Context())
	req.Header.Set(ProtocolHeader, strconv.Itoa(v.proto))
	resp, err := v.base.RoundTrip(req)
	if err != nil || (resp.StatusCode != http.StatusConflict && resp.StatusCode != http.StatusForbidden) {
		return resp, err
	}
	b, err := io.ReadAll(io.LimitReader(resp.Body, 16<<10))
	resp.Body.Close()
	if err != nil {
		return nil, err
	}
	switch body := strings.TrimSpace(string(b)); {
	case resp.StatusCode == http.StatusConflict && body == protocolMismatch:
		theirs, _ := strconv.Atoi(resp.Header.Get(ProtocolHeader))
		return nil, ProtocolMismatchError{Ours: v.proto, Theirs: theirs}
	case resp.StatusCode == http.StatusForbidden && body == notPaired:
		return nil, ErrNotPaired
	}
	resp.Body = io.NopCloser(bytes.NewReader(b))
	return resp, nil
}

// ProtocolHeader は、頼みと包みの断りに常駐間通信プロトコルの版を載せる見出し
const ProtocolHeader = "Matomezu-Protocol"

// protocolMismatch は、包みが、常駐間通信プロトコルの版の合わない頼みに 409 で返す本文（答えの見出し ProtocolHeader に自分の版）
const protocolMismatch = "protocol-mismatch"

// ProtocolMismatchError は、相手の常駐間通信プロトコルの版がこちらと合わなかったこと（Theirs は相手の版。名乗らなければ 0）
type ProtocolMismatchError struct{ Ours, Theirs int }

func (e ProtocolMismatchError) Error() string {
	return fmt.Sprintf("peer: the host keeps protocol %d, this host keeps %d", e.Theirs, e.Ours)
}

// TheirsNewer は、相手の版のほうが新しいか（こちらを更新すれば合う）
func (e ProtocolMismatchError) TheirsNewer() bool { return e.Theirs > e.Ours }

// ErrNotPaired は、相手が、固定した鍵で確かめた答えで「ペアリングしていない」と答えたこと（受けた側は、自分の側のペアリングを消す）
var ErrNotPaired = errors.New("peer: the host answered that it is not paired")

// Server は、ホストどうしの入口の http.Server（ServeTLS(ln, "", "") で受ける。頼みを送ってきたホストは RequestHost で読む）
func Server(id *Identity, h http.Handler) *http.Server {
	return &http.Server{
		Handler:           h,
		TLSConfig:         ServerConfig(id),
		ReadHeaderTimeout: 10 * time.Second,
	}
}

// RequestHost は、頼みを送ってきたホストの id（TLS の相手の証明書の公開鍵から決める。頼みの中の申告は読まない）
func RequestHost(r *http.Request) (string, bool) {
	if r.TLS == nil || len(r.TLS.PeerCertificates) == 0 {
		return "", false
	}
	return HostIDOf(r.TLS.PeerCertificates[0]), true
}

// notPaired は、Pinned が、ペアリングしていない相手に 403 で返す本文
const notPaired = "not-paired"

// Pinned は、常駐間通信プロトコルの版が proto で、ペアリングしたホスト（known が true と答えるホスト id）の頼みだけを h に通す包み。
// 版を先に見る（版の違う相手には、ペアリングしていないとも答えない。相手がそれで自分の側を消さないため）
func Pinned(proto int, known func(hostID string) bool, h http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id, ok := RequestHost(r)
		switch {
		case !ok:
			http.Error(w, notPaired, http.StatusForbidden)
		case !sameProtocol(w, r, proto):
		case !known(id):
			http.Error(w, notPaired, http.StatusForbidden)
		default:
			h(w, r)
		}
	}
}

// Unpinned は、鍵を知らない相手の頼みも h に通す包み（ペアリングの頼みの口だけが使う）。TLS の証明書は必ず要り、常駐間通信プロトコルの版は proto でなければ通さない
func Unpinned(proto int, h http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if _, ok := RequestHost(r); !ok {
			http.Error(w, "no host key", http.StatusForbidden)
			return
		}
		if sameProtocol(w, r, proto) {
			h(w, r)
		}
	}
}

// sameProtocol は、頼み r の常駐間通信プロトコルの版が proto か。違えば（名乗らなくても）409 で断り、答えの見出しに自分の版を載せる
func sameProtocol(w http.ResponseWriter, r *http.Request, proto int) bool {
	if r.Header.Get(ProtocolHeader) == strconv.Itoa(proto) {
		return true
	}
	w.Header().Set(ProtocolHeader, strconv.Itoa(proto))
	http.Error(w, protocolMismatch, http.StatusConflict)
	return false
}
