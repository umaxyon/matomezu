package server

// ホストどうしの入口の口（hosts.go が TLS で受けて渡す）。どの口も peer の包みで包む: ペアリングしたホストの頼みだけを通す peer.Pinned と、
// 鍵を知らない相手の頼みも通す peer.Unpinned（ペアリングの頼みの口 1 つだけが使う。テストが見張る）

import (
	"net/http"

	"github.com/umaxyon/matomezu/internal/peer"
)

func (h *Hub) hostsHandler() http.Handler {
	mux := http.NewServeMux()
	mux.Handle("POST /peer/v1/pairing", peer.Unpinned(h.pairing)) // peer.PairingPath
	mux.Handle("GET /peer/v1/hello", peer.Pinned(h.isPairedHost, h.peerHello))
	mux.Handle("POST /peer/v1/unpair", peer.Pinned(h.isPairedHost, h.peerUnpair))
	mux.Handle("POST /peer/v1/message", peer.Pinned(h.isPairedHost, h.peerMessage))
	return mux
}
