package storage

import (
	"database/sql"
	"encoding/json"
)

// addLaneShows は、プロジェクトにレーンのタイトル帯に出す物（laneShows）を足す: 持っていないプロジェクトは { count: true }（件数を出す）。
// もう値のある物は変えない。種類の表（rec_<n>）と、伝えられる前の records の行の両方を書き換える
func addLaneShows(tx *sql.Tx) error {
	return rewriteBodies(tx, projectKind, func(body map[string]json.RawMessage) bool {
		if _, ok := body["laneShows"]; ok {
			return false
		}
		body["laneShows"] = json.RawMessage(`{"count":true}`)
		return true
	})
}
