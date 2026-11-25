package storage

import (
	"database/sql"
	"encoding/json"
)

// droppedPageTextColors は、やめたページの設定の項目（文字の色の上書き。文字の色は利用者の設定の項目だけで変える）
const droppedPageTextColors = "@matomezu/base:page-text-colors"

// dropPageTextColors は、ページの設定 settings から、やめた項目 droppedPageTextColors の値を外す。
// ほかのキーの順と値、書いた時刻は変えず、変えた行の版を 1 上げる。項目が 1 つも残らなければ settings ごと外す。
// レコード（変更提案郵便に乗ったアクションなど）は見ない
func dropPageTextColors(tx *sql.Tx) error {
	pages, err := pageBodies(tx)
	if err != nil {
		return err
	}
	for id, body := range pages {
		var head struct {
			Settings map[string]json.RawMessage `json:"settings"`
		}
		if json.Unmarshal(body, &head) != nil {
			continue
		}
		if _, ok := head.Settings[droppedPageTextColors]; !ok {
			continue
		}
		var raw struct {
			Settings json.RawMessage `json:"settings"`
		}
		_ = json.Unmarshal(body, &raw)
		settings, ok := withField(raw.Settings, droppedPageTextColors, nil)
		if !ok {
			continue
		}
		var value json.RawMessage = settings
		if len(head.Settings) == 1 {
			value = nil
		}
		next, ok := withField(body, "settings", value)
		if !ok {
			continue
		}
		if _, err := tx.Exec(`UPDATE pages SET body = ?, version = version + 1 WHERE id = ?`, string(next), id); err != nil {
			return err
		}
	}
	return nil
}
