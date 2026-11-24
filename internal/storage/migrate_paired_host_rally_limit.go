package storage

import (
	"database/sql"
	"encoding/json"
)

// addPairedHostRallyLimit は、ペアリングしたホストに rallyLimit（そのホストから届く AI ラリーの上限）を足す: 持っていない物は 15（既定）。
// もう値のある物は変えない。種類の表（rec_<n>）と、伝えられる前の records の行の両方を書き換える
func addPairedHostRallyLimit(tx *sql.Tx) error {
	return rewriteBodies(tx, pairedHostKind, func(body map[string]json.RawMessage) bool {
		if _, ok := body["rallyLimit"]; ok {
			return false
		}
		body["rallyLimit"] = json.RawMessage(`15`)
		return true
	})
}
