package server

// ホストどうしの入口の口（hosts.go が TLS で受けて渡す）。どの口も peer の包みで包む: ペアリングしたホストの頼みだけを通す peer.Pinned と、
// 鍵を知らない相手の頼みも通す peer.Unpinned（ペアリングの頼みの口 1 つだけが使う。テストが見張る）

import (
	"net/http"

	"github.com/umaxyon/matomezu/internal/peer"
)

func (h *Hub) hostsHandler() http.Handler {
	mux := http.NewServeMux()
	mux.Handle("POST /peer/v1/pairing", peer.Unpinned(h.pairing))
	return mux
}

// pairingHello は、ペアリングの頼みの最初の答え: 約束の版・このホストの id・ホスト名
type pairingHello struct {
	Protocol int    `json:"protocol"`
	HostID   string `json:"hostId"`
	Name     string `json:"name"`
}

// pairing は、ペアリングの頼みの口: 約束の版とこのホストを答える
func (h *Hub) pairing(w http.ResponseWriter, _ *http.Request) {
	s := h.HostStatus()
	writeJSON(w, pairingHello{Protocol: peer.Protocol, HostID: s.HostID, Name: s.Name})
}
