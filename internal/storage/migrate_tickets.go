package storage

import (
	"database/sql"
	"encoding/json"
	"slices"
	"strings"
)

// ticketsToOneList は、ブックごとの AI 編集チケットの並び（表 ai_edit_tickets の、ブックの id ごとの行）を、全部で 1 つの並び（同じ名前の表の 1 行）にする。
// 残すのは key で見分ける物（アクションが開いた物。変更提案郵便など）で、その物に、置いてあったブックの id（book）を書き足す。
// AI のアクションごとの物（act で見分ける。まだ見られていない・見られる前に消えた）は捨てる: どの窓が見たかは窓だけが覚えていて、移し替えのあとの窓は、前の変更を知らないため。
// 並びは、変えた時点（at）の古い順（同じなら、ブックの id の順で、元の並びの順）
func ticketsToOneList(tx *sql.Tx) error {
	rows, err := tx.Query(`SELECT book, body FROM ai_edit_tickets ORDER BY book`)
	if err != nil {
		return err
	}
	type ticket struct {
		at   string
		body json.RawMessage
	}
	var kept []ticket
	for rows.Next() {
		var book, body string
		if err := rows.Scan(&book, &body); err != nil {
			rows.Close()
			return err
		}
		var list []map[string]json.RawMessage
		if json.Unmarshal([]byte(body), &list) != nil {
			continue
		}
		for _, t := range list {
			var key, at string
			if json.Unmarshal(t["key"], &key) != nil || key == "" {
				continue
			}
			_ = json.Unmarshal(t["at"], &at)
			id, err := json.Marshal(book)
			if err != nil {
				rows.Close()
				return err
			}
			t["book"] = id
			out, err := json.Marshal(t)
			if err != nil {
				rows.Close()
				return err
			}
			kept = append(kept, ticket{at, out})
		}
	}
	if err := rows.Err(); err != nil {
		return err
	}
	rows.Close()
	slices.SortStableFunc(kept, func(a, b ticket) int { return strings.Compare(a.at, b.at) })
	if _, err := tx.Exec(`DROP TABLE ai_edit_tickets;
		CREATE TABLE ai_edit_tickets (
			id INTEGER PRIMARY KEY CHECK (id = 1),
			body TEXT NOT NULL,
			updated_at TEXT NOT NULL
		)`); err != nil {
		return err
	}
	if len(kept) == 0 {
		return nil
	}
	list := make([]json.RawMessage, len(kept))
	for i, t := range kept {
		list[i] = t.body
	}
	body, err := json.Marshal(list)
	if err != nil {
		return err
	}
	return txPutTickets(tx, body)
}
