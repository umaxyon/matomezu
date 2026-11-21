package storage

import (
	"database/sql"
	"fmt"
)

// currentTicketKind は、ワークルームのチケットを記録していた古い種類（捨てる）
const currentTicketKind = "@matomezu/taskboard:current-ticket"

// dropCurrentTickets は、currentTicketKind のレコードを捨てる: 種類の表（rec_<n>）と kinds の行、伝えられる前の records の行
func dropCurrentTickets(tx *sql.Tx) error {
	var n int
	switch err := tx.QueryRow(`SELECT n FROM kinds WHERE subject = ?`, currentTicketKind).Scan(&n); err {
	case nil:
		if _, err := tx.Exec(fmt.Sprintf(`DROP TABLE IF EXISTS rec_%d`, n)); err != nil {
			return err
		}
		if _, err := tx.Exec(`DELETE FROM kinds WHERE n = ?`, n); err != nil {
			return err
		}
	case sql.ErrNoRows:
	default:
		return err
	}
	_, err := tx.Exec(`DELETE FROM records WHERE subject = ?`, currentTicketKind)
	return err
}
