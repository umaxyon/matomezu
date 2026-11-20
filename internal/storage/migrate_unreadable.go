package storage

import (
	"database/sql"
	"fmt"
)

// addUnreadableFolder は、読めない物のフォルダの行（library-unreadable。中は空）を作る（空の置き場所でも）。同じ id の行がほかの役で在れば止める。
// 読めない物を移すのは、常駐が起動したときに行う（ここでは移さない）
func addUnreadableFolder(tx *sql.Tx) error {
	var body []byte
	err := tx.QueryRow(`SELECT body FROM folders WHERE id = ?`, UnreadableID).Scan(&body)
	switch {
	case err == sql.ErrNoRows:
		_, err = tx.Exec(`INSERT INTO folders (id, body, version, updated_at) VALUES (?, ?, 1, ?)`, UnreadableID, string(UnreadableBody(nil)), now())
		return err
	case err != nil:
		return err
	case RoleOf(body) != "unreadable":
		return fmt.Errorf("the folder %s is not the unreadable folder", UnreadableID)
	}
	return nil
}
