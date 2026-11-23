package peer

import (
	"crypto/tls"
	"errors"
	"net"
	"net/http"
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

// Client は、ほかのホストの入口へ頼む HTTP のクライアント（expect は ClientConfig と同じ）
func Client(id *Identity, expect string, timeout time.Duration) *http.Client {
	return &http.Client{
		Timeout: timeout,
		Transport: &http.Transport{
			TLSClientConfig:   ClientConfig(id, expect),
			ForceAttemptHTTP2: true,
			DialContext:       (&net.Dialer{Timeout: timeout}).DialContext,
		},
	}
}

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

// NotPaired は、Pinned が、ペアリングしていない相手に 403 で返す本文（相手は、固定した鍵で確かめた答えとして、自分の側のペアリングを消す）
const NotPaired = "not-paired"

// Pinned は、ペアリングしたホスト（known が true と答えるホスト id）の頼みだけを h に通す包み。ほかは 403 で NotPaired
func Pinned(known func(hostID string) bool, h http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id, ok := RequestHost(r)
		if !ok || !known(id) {
			http.Error(w, NotPaired, http.StatusForbidden)
			return
		}
		h(w, r)
	}
}

// Unpinned は、鍵を知らない相手の頼みも h に通す包み（ペアリングの頼みの入口だけが使う）。TLS の証明書は必ず要る
func Unpinned(h http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if _, ok := RequestHost(r); !ok {
			http.Error(w, "no host key", http.StatusForbidden)
			return
		}
		h(w, r)
	}
}
