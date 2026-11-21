package storage

import (
	"database/sql"
	"errors"
	"fmt"
)

// 参加の要求の郵便の種類（移し替えの時点の id）
const joinRequestMail = "@matomezu/base:join-request"

// dropJoinRequestMail は、参加の要求の郵便を消す。郵便のレコードは、種類の表（rec_<n>）か、種類を伝えられる前の表 records に在る
func dropJoinRequestMail(tx *sql.Tx) error {
	const isRequest = `json_valid(body) AND json_extract(body, '$.mail') = ?`
	if _, err := tx.Exec(`DELETE FROM records WHERE subject = ? AND `+isRequest, mailKind, joinRequestMail); err != nil {
		return err
	}
	var n int64
	err := tx.QueryRow(`SELECT n FROM kinds WHERE subject = ?`, mailKind).Scan(&n)
	if errors.Is(err, sql.ErrNoRows) {
		return nil
	}
	if err != nil {
		return err
	}
	_, err = tx.Exec(fmt.Sprintf(`DELETE FROM rec_%d WHERE `, n)+isRequest, joinRequestMail)
	return err
}
