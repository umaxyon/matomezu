package peer

// ペアリングの手順: 頼む側（A）と受ける側（B）が、鍵を知らないまま 1 つの口（POST /peer/v1/pairing、Unpinned）で 2 回やり取りし、両方の画面に同じ接続確認コードを出す。
//
//  1. commit: A は乱数 nA のハッシュを渡す。B は乱数 nB を返す
//  2. reveal: A は nA を見せる。B はハッシュと照らし、利用者が答えるまで（上限 PairingWait）答えを返さない
//
// 接続確認コードは、両方の鍵（TLS で見たホスト id）と両方の乱数から作る。A が nB を見る前に nA を決めているので、間に入った者が合うコードを作るには、
// 鍵を作り直しながら当てるしかなく、6 桁を 1 回で当てる見込みしかない（鍵だけから作ると、合う鍵を総当たりで作られる）。
// 2 回のやり取りは、TLS で見た A のホスト id で結ぶ（頼みの中身では結ばない）

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/binary"
	"encoding/hex"
	"fmt"
	"time"
)

// PairingWait は、B が利用者の答えを待ついちばん長い時間（A は、これに余裕を足して待つ）
const PairingWait = 2 * time.Minute

// PairingPath は、ペアリングの頼みの口
const PairingPath = "/peer/v1/pairing"

// PairingCommit は、A の 1 回目の頼み
type PairingCommit struct {
	Step     string `json:"step"` // "commit"
	Name     string `json:"name"`
	UserName string `json:"userName"`
	Port     int    `json:"port"`   // A の待っている所のポート（B が、あとで A へつなぐのに使う）
	Commit   string `json:"commit"` // A の乱数のハッシュ（16 進）
}

// PairingHello は、B の 1 回目の答え
type PairingHello struct {
	HostID   string `json:"hostId"`
	Name     string `json:"name"`
	UserName string `json:"userName"`
	Nonce    string `json:"nonce"` // B の乱数（16 進）
}

// PairingReveal は、A の 2 回目の頼み
type PairingReveal struct {
	Step  string `json:"step"`  // "reveal"
	Nonce string `json:"nonce"` // A の乱数（16 進）
}

// PairingOutcome は、B の 2 回目の答え（利用者がどうしたか）
type PairingOutcome string

const (
	PairingAccepted PairingOutcome = "accepted"
	PairingDeclined PairingOutcome = "declined"
	PairingTimedOut PairingOutcome = "timed-out"
)

// PairingAnswer は、B の 2 回目の答え
type PairingAnswer struct {
	Outcome PairingOutcome `json:"outcome"`
}

// PairingRefusal は、B が頼みを断るときの理由（403・409 などの本文）
type PairingRefusal struct {
	Reason string `json:"reason"` // protocol・self・busy・no-commit・commit-mismatch・closed
}

// NewNonce は、ペアリングの乱数（32 バイト、16 進）
func NewNonce() string {
	b := make([]byte, 32)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

// CommitOf は、乱数のハッシュ（16 進）
func CommitOf(nonce string) string {
	sum := sha256.Sum256([]byte(nonce))
	return hex.EncodeToString(sum[:])
}

// PairingCode は、接続確認コード（6 桁）。requester は頼んだ側（A）、accepter は受けた側（B）のホスト id と乱数
func PairingCode(requester, accepter, requesterNonce, accepterNonce string) string {
	h := sha256.New()
	for _, part := range []string{"matomezu-pairing-v1", requester, accepter, requesterNonce, accepterNonce} {
		var n [4]byte
		binary.BigEndian.PutUint32(n[:], uint32(len(part)))
		h.Write(n[:])
		h.Write([]byte(part))
	}
	sum := h.Sum(nil)
	return fmt.Sprintf("%06d", binary.BigEndian.Uint64(sum[:8])%1_000_000)
}
