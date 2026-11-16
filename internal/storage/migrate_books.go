package storage

import (
	"database/sql"
	"encoding/json"
)

// booksToTables は、ブックの表（1 冊を、ページの中身ごと 1 行に持つ）を、フォルダとページとエントリの表に分けて、元の表を捨てる（分け方は split.go）。
// ブックのフォルダは、ブックの版と書いた時刻を引き継ぐ。バインダとページの版は 1 から。
// 分けられないブック（本文が読めない・id が行の id と違う・id がもう使われている）は、本文をそのままフォルダの 1 行に残す（読めないブックとして見える）。
// 分けられないエントリ（id が無い・ほかのブックがもう使っている id）は、そのフォルダの並びに中身ごと残る
func booksToTables(tx *sql.Tx) error {
	rows, err := tx.Query(`SELECT id, body, version, updated_at FROM books ORDER BY id`)
	if err != nil {
		return err
	}
	type book struct {
		id, body, updated string
		version           int64
	}
	var books []book
	// ブックの id は、ほかのブックのページやバインダの id に取られないよう、先に全部を使われている id にしておく
	taken := map[string]bool{}
	for rows.Next() {
		var b book
		if err := rows.Scan(&b.id, &b.body, &b.version, &b.updated); err != nil {
			rows.Close()
			return err
		}
		books = append(books, b)
		taken[b.id] = true
	}
	if err := rows.Close(); err != nil {
		return err
	}
	put := func(table, id string, body json.RawMessage, version int64, updated string) error {
		_, err := tx.Exec(`INSERT INTO `+table+` (id, body, version, updated_at) VALUES (?, ?, ?, ?)`, id, string(body), version, updated)
		return err
	}
	for _, b := range books {
		var head struct {
			ID string `json:"id"`
		}
		_ = json.Unmarshal([]byte(b.body), &head)
		delete(taken, b.id)
		split, ok := Split{}, false
		if head.ID == b.id {
			split, ok = SplitBook(json.RawMessage(b.body), taken)
		}
		taken[b.id] = true
		if !ok {
			if err := put("folders", b.id, json.RawMessage(b.body), b.version, b.updated); err != nil {
				return err
			}
			continue
		}
		for i, f := range split.Folders {
			version := int64(1)
			if i == 0 {
				version = b.version
			}
			if err := put("folders", f.ID, f.Body, version, b.updated); err != nil {
				return err
			}
		}
		for _, p := range split.Pages {
			if err := put("pages", p.ID, p.Body, 1, b.updated); err != nil {
				return err
			}
		}
		for id, folder := range split.Entries {
			if _, err := tx.Exec(`INSERT INTO entries (id, folder) VALUES (?, ?)`, id, folder); err != nil {
				return err
			}
		}
	}
	_, err = tx.Exec(`DROP TABLE books`)
	return err
}
