package storage

import (
	"crypto/rand"
	"database/sql"
	"encoding/json"
	"fmt"
)

// 書庫: フォルダの行は、書庫ホーム（folderRole が "home"。ただ 1 つで、どのフォルダにも入らない）・フォルダ（"folder"）・ブック・バインダ（"binder"）のどれか。
// 書庫ホームとフォルダは、id だけのエントリ（{"kind": "page" | "binder" | "book" | "folder", "id"}）を順に持つ。
// ブックは、folderRole が home・folder・binder のどれでもない行（"book" と、役の無い・読めない行 = 読めないブック）。どのフォルダに入っているかでは決めない

// HomeID は、書庫ホームの id（決まった値）
const HomeID = "library-home"

// IsBookRole は、フォルダの行の役 role（folderRole の値。無い・読めないなら空）が、ブックの役か
func IsBookRole(role string) bool {
	return role != "home" && role != "folder" && role != "binder"
}

// RoleOf は、フォルダの行の本文 body の役（folderRole。無い・文字でない・本文が読めないなら空）
func RoleOf(body json.RawMessage) string {
	var head map[string]json.RawMessage
	var role string
	if json.Unmarshal(body, &head) != nil || json.Unmarshal(head["folderRole"], &role) != nil {
		return ""
	}
	return role
}

// HomeBody は、エントリ lineup を持つ書庫ホームの本文
func HomeBody(lineup []json.RawMessage) json.RawMessage {
	if lineup == nil {
		lineup = []json.RawMessage{}
	}
	return marshal(map[string]any{"folderRole": "home", "id": HomeID, "lineup": lineup})
}

// RefOf は、id だけのエントリ（kind は "page"・"binder"・"book"・"folder"）
func RefOf(kind, id string) json.RawMessage { return refOf(kind, id) }

// roleSQL は、表 folders の行の役を読む SQL の式（本文が読めない行は NULL。json_extract は読めない本文で誤りになるので、先に確かめる）
const roleSQL = `CASE WHEN json_valid(body) THEN json_extract(body, '$.folderRole') END`

// notBookSQL は、ブックでないフォルダの行の id（書庫ホーム・フォルダ・バインダ）を選ぶ SQL
const notBookSQL = `SELECT id FROM folders WHERE ` + roleSQL + ` IN ('home', 'folder', 'binder')`

// placeBooksInLibrary は、書庫ホームを作り、どのフォルダにも入っていないフォルダ（ブック。読めない物も）が在れば、
// 書庫ホームの中のフォルダ「旧ブック」（作った uuid）を作って、それらを id の順に入れる（entries も）。1 つも無ければ「旧ブック」は作らない。
// ブック・バインダ・ページの行は書き換えない
func placeBooksInLibrary(tx *sql.Tx) error {
	rows, err := tx.Query(`SELECT id FROM folders WHERE id != ? AND id NOT IN (SELECT id FROM entries) ORDER BY id`, HomeID)
	if err != nil {
		return err
	}
	var books []string
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			rows.Close()
			return err
		}
		books = append(books, id)
	}
	if err := rows.Close(); err != nil {
		return err
	}
	at := now()
	put := func(id string, body json.RawMessage) error {
		_, err := tx.Exec(`INSERT INTO folders (id, body, version, updated_at) VALUES (?, ?, 1, ?)`, id, string(body), at)
		return err
	}
	if len(books) == 0 {
		return put(HomeID, HomeBody(nil))
	}
	old := newUUID()
	refs := make([]json.RawMessage, 0, len(books))
	for _, id := range books {
		refs = append(refs, refOf("book", id))
		if _, err := tx.Exec(`INSERT INTO entries (id, folder) VALUES (?, ?)`, id, old); err != nil {
			return err
		}
	}
	if err := put(old, marshal(map[string]any{"folderRole": "folder", "id": old, "title": "旧ブック", "lineup": refs})); err != nil {
		return err
	}
	if _, err := tx.Exec(`INSERT INTO entries (id, folder) VALUES (?, ?)`, old, HomeID); err != nil {
		return err
	}
	return put(HomeID, HomeBody([]json.RawMessage{refOf("folder", old)}))
}

// newUUID は、uuid の形の乱数（版 4）
func newUUID() string {
	var b [16]byte
	_, _ = rand.Read(b[:])
	b[6] = b[6]&0x0f | 0x40
	b[8] = b[8]&0x3f | 0x80
	return fmt.Sprintf("%x-%x-%x-%x-%x", b[0:4], b[4:6], b[6:8], b[8:10], b[10:16])
}
