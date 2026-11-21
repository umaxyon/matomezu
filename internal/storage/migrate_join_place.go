package storage

import (
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
)

// joinRequestMail は、参加要求の郵便の種類
const joinRequestMail = "@matomezu/base:join-request"

// joinRequestPlaces は、参加要求の郵便が持つ Orca のワークスペースの名前（props.orcaWorkspace）を、AI のセッションが動いている場所（props.place）に名前を替える
func joinRequestPlaces(tx *sql.Tx) error {
	type table struct{ name, where, and string }
	tables := []table{{"records", ` WHERE subject = '` + mailKind + `'`, ` AND subject = '` + mailKind + `'`}}
	var n int64
	err := tx.QueryRow(`SELECT n FROM kinds WHERE subject = ?`, mailKind).Scan(&n)
	if err == nil {
		tables = append(tables, table{fmt.Sprintf("rec_%d", n), "", ""})
	} else if !errors.Is(err, sql.ErrNoRows) {
		return err
	}
	for _, t := range tables {
		rows, err := tx.Query(`SELECT id, body FROM ` + t.name + t.where)
		if err != nil {
			return err
		}
		type put struct{ id, body string }
		var puts []put
		for rows.Next() {
			var id, body string
			if err := rows.Scan(&id, &body); err != nil {
				rows.Close()
				return err
			}
			var mail map[string]json.RawMessage
			var kind string
			var props map[string]json.RawMessage
			if json.Unmarshal([]byte(body), &mail) != nil || json.Unmarshal(mail["mail"], &kind) != nil || kind != joinRequestMail ||
				json.Unmarshal(mail["props"], &props) != nil {
				continue
			}
			old, ok := props["orcaWorkspace"]
			if !ok {
				continue
			}
			delete(props, "orcaWorkspace")
			if _, has := props["place"]; !has {
				props["place"] = old
			}
			if mail["props"], err = json.Marshal(props); err != nil {
				rows.Close()
				return err
			}
			next, err := json.Marshal(mail)
			if err != nil {
				rows.Close()
				return err
			}
			puts = append(puts, put{id, string(next)})
		}
		if err := rows.Close(); err != nil {
			return err
		}
		for _, p := range puts {
			if _, err := tx.Exec(`UPDATE `+t.name+` SET body = ? WHERE id = ?`+t.and, p.body, p.id); err != nil {
				return err
			}
		}
	}
	return nil
}
