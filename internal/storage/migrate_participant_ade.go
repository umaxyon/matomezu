package storage

import (
	"database/sql"
	"encoding/json"
	"fmt"
)

// participantKind は、参加者の種類
const participantKind = "@matomezu/base:participant"

// participantAdeWorkspaces は、要求中の参加者が持つ orcaWorkspace を adeWorkspace（ADE のワークスペースの名前）に名前を替える。
// 種類の表（rec_<n>）と、伝えられる前の records の行の両方
func participantAdeWorkspaces(tx *sql.Tx) error {
	type put struct{ id, body string }
	var puts []put
	if err := readBodies(tx, participantKind, func(id string, body []byte) {
		var p map[string]json.RawMessage
		if json.Unmarshal(body, &p) != nil {
			return
		}
		old, ok := p["orcaWorkspace"]
		if !ok {
			return
		}
		delete(p, "orcaWorkspace")
		if _, has := p["adeWorkspace"]; !has {
			p["adeWorkspace"] = old
		}
		if next, err := json.Marshal(p); err == nil {
			puts = append(puts, put{id, string(next)})
		}
	}); err != nil {
		return err
	}
	var n int64
	switch err := tx.QueryRow(`SELECT n FROM kinds WHERE subject = ?`, participantKind).Scan(&n); err {
	case nil, sql.ErrNoRows:
	default:
		return err
	}
	for _, p := range puts {
		if _, err := tx.Exec(`UPDATE records SET body = ? WHERE subject = ? AND id = ?`, p.body, participantKind, p.id); err != nil {
			return err
		}
		if n != 0 {
			if _, err := tx.Exec(fmt.Sprintf(`UPDATE rec_%d SET body = ? WHERE id = ?`, n), p.body, p.id); err != nil {
				return err
			}
		}
	}
	return nil
}
