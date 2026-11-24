package storage

import (
	"database/sql"
	"encoding/json"
)

// addPairedHostListed は、ペアリングしたホストに listed（AI が読むワークルームの見渡しにそのホストを載せるか）を足す: 持っていない物は listed（載せる。既定）。
// もう値のある物は変えない。種類の表（rec_<n>）と、伝えられる前の records の行の両方を書き換える
func addPairedHostListed(tx *sql.Tx) error {
	return rewriteBodies(tx, pairedHostKind, func(body map[string]json.RawMessage) bool {
		if _, ok := body["listed"]; ok {
			return false
		}
		body["listed"] = json.RawMessage(`"listed"`)
		return true
	})
}
