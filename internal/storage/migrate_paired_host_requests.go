package storage

import (
	"database/sql"
	"encoding/json"
)

const pairedHostKind = "@matomezu/network:paired-host"

// addPairedHostRequests は、ペアリングしたホストに頼みの扱い（requests）を足す: 持っていない物は ask-user（受け取った AI が利用者に聞く。既定）。
// もう値のある物は変えない。種類の表（rec_<n>）と、伝えられる前の records の行の両方を書き換える
func addPairedHostRequests(tx *sql.Tx) error {
	return rewriteBodies(tx, pairedHostKind, func(body map[string]json.RawMessage) bool {
		if _, ok := body["requests"]; ok {
			return false
		}
		body["requests"] = json.RawMessage(`"ask-user"`)
		return true
	})
}
