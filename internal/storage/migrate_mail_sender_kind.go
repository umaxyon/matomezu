package storage

import (
	"database/sql"
	"encoding/json"
)

// addMailSenderKind は、郵便に送り手が AI か利用者か（senderKind）を足す: 持っていない郵便は "ai"（AI から届いた郵便）。
// もう値のある物は変えない。種類の表（rec_<n>）と、伝えられる前の records の行の両方を書き換える
func addMailSenderKind(tx *sql.Tx) error {
	return rewriteBodies(tx, mailKind, func(body map[string]json.RawMessage) bool {
		if _, ok := body["senderKind"]; ok {
			return false
		}
		body["senderKind"] = json.RawMessage(`"ai"`)
		return true
	})
}
