package storage

import (
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
)

// 郵便のレコードの種類と、変更提案郵便の種類（移し替えの時点の id）
const (
	mailKind     = "@matomezu/base:mail"
	proposalMail = "@matomezu/base:proposal"
)

// proposalSnapshotsToPlaces は、変更提案郵便が持つ「当たる物の、送った時の自分の値」（props.snapshot）を、物の id → 値の表から、
// 物のある所（ページの id。バインダとブックそのものは、ブックの id）→ 物の id → 値の表に直す（物の id は、ページの中でだけ重ならなくなったため）。
// 物のある所は、郵便のブック（props.book）の今の中身から引く。もうどのページにも無い物は、ブックの id の所に入れる（反映のときに、無くなったとして失敗になる）
func proposalSnapshotsToPlaces(tx *sql.Tx) error {
	// 郵便のレコードの置き場所: 種類の表（rec_<n>）か、種類を伝えられる前の表 records（その種類の行だけ）
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
			if json.Unmarshal([]byte(body), &mail) != nil || json.Unmarshal(mail["mail"], &kind) != nil || kind != proposalMail {
				continue
			}
			var props map[string]json.RawMessage
			var book string
			var snapshot map[string]json.RawMessage
			if json.Unmarshal(mail["props"], &props) != nil || json.Unmarshal(props["book"], &book) != nil || json.Unmarshal(props["snapshot"], &snapshot) != nil {
				continue
			}
			var bookBody string
			if err := tx.QueryRow(`SELECT body FROM books WHERE id = ?`, book).Scan(&bookBody); err != nil && !errors.Is(err, sql.ErrNoRows) {
				rows.Close()
				return err
			}
			pages := pageIDsOf(json.RawMessage(bookBody))
			placed := map[string]map[string]json.RawMessage{}
			for thing, value := range snapshot {
				within := book
				for _, p := range pages {
					if p.id == thing || p.ids[thing] {
						within = p.id
						break
					}
				}
				if placed[within] == nil {
					placed[within] = map[string]json.RawMessage{}
				}
				placed[within][thing] = value
			}
			raw, err := json.Marshal(placed)
			if err != nil {
				rows.Close()
				return err
			}
			props["snapshot"] = raw
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
