package storage

import (
	"database/sql"
	"encoding/json"
	"fmt"
)

const (
	ticketKind  = "@matomezu/taskboard:ticket"
	projectKind = "@matomezu/taskboard:project"
)

// addTicketVolume は、チケットに規模（volume）を足す: 持っていないチケットは none（見積もっていない）、
// プロジェクトの cardShows に volume を持っていない物は true（カードに規模を出す）。もう値のある物は変えない。
// 種類の表（rec_<n>）と、伝えられる前の records の行の両方を書き換える
func addTicketVolume(tx *sql.Tx) error {
	if err := rewriteBodies(tx, ticketKind, func(body map[string]json.RawMessage) bool {
		if _, ok := body["volume"]; ok {
			return false
		}
		body["volume"] = json.RawMessage(`"none"`)
		return true
	}); err != nil {
		return err
	}
	return rewriteBodies(tx, projectKind, func(body map[string]json.RawMessage) bool {
		var shows map[string]json.RawMessage
		if json.Unmarshal(body["cardShows"], &shows) != nil || shows == nil {
			return false
		}
		if _, ok := shows["volume"]; ok {
			return false
		}
		shows["volume"] = json.RawMessage(`true`)
		raw, err := json.Marshal(shows)
		if err != nil {
			return false
		}
		body["cardShows"] = raw
		return true
	})
}

// rewriteBodies は、種類 subject のレコードの body を change で直す（change が false を返した物は書かない）。
// 種類の表があればその表を、伝えられる前の records の行も見る
func rewriteBodies(tx *sql.Tx, subject string, change func(map[string]json.RawMessage) bool) error {
	var n int
	switch err := tx.QueryRow(`SELECT n FROM kinds WHERE subject = ?`, subject).Scan(&n); err {
	case nil:
		if err := rewriteRows(tx, fmt.Sprintf(`rec_%d`, n), ``, nil, change); err != nil {
			return err
		}
	case sql.ErrNoRows:
	default:
		return err
	}
	return rewriteRows(tx, `records`, ` WHERE subject = ?`, []any{subject}, change)
}

func rewriteRows(tx *sql.Tx, table, where string, args []any, change func(map[string]json.RawMessage) bool) error {
	rows, err := tx.Query(`SELECT id, body FROM `+table+where, args...)
	if err != nil {
		return err
	}
	type row struct{ id, body string }
	var changed []row
	for rows.Next() {
		var id, body string
		if err := rows.Scan(&id, &body); err != nil {
			rows.Close()
			return err
		}
		var m map[string]json.RawMessage
		if json.Unmarshal([]byte(body), &m) != nil || m == nil || !change(m) {
			continue
		}
		next, err := json.Marshal(m)
		if err != nil {
			rows.Close()
			return err
		}
		changed = append(changed, row{id, string(next)})
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return err
	}
	for _, r := range changed {
		if _, err := tx.Exec(`UPDATE `+table+` SET body = ? WHERE id = ?`+andSubject(where), append([]any{r.body, r.id}, args...)...); err != nil {
			return err
		}
	}
	return nil
}

// andSubject は、records の行を書き換えるときに、種類でも絞る（records の主キーは種類と id）
func andSubject(where string) string {
	if where == `` {
		return ``
	}
	return ` AND subject = ?`
}
