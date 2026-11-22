package storage

import (
	"crypto/rand"
	"database/sql"
	"encoding/json"
	"fmt"
	"slices"
	"strings"
)

// 書庫: フォルダの行は、書庫ホーム（folderRole が "home"）・ゴミ箱（"trash"）・読めない物のフォルダ（"unreadable"）・フォルダ（"folder"）・ブック・バインダ（"binder"）のどれか。
// 書庫ホーム・ゴミ箱・読めない物のフォルダは書庫の一番上のフォルダで、どれもただ 1 つ・名前なし・どのフォルダにも入らない（表 entries に自分の行を持たない）。
// 書庫ホームとフォルダは、id だけのエントリ（{"kind": "page" | "binder" | "book" | "folder", "id"}）を順に持つ。
// ゴミ箱のエントリは、それに入れた時刻 trashed と、元いたフォルダから書庫ホームまでの id の列 from（近い順）も持つ（trashRef）。
// 読めない物のフォルダのエントリは、在った所の並びのエントリ entry と、在った所の覚え（from・after・code・type・moved。core/folders.ts の UnreadableRef）を持つ。
// 中の物の表 entries の folder は、読めない物のフォルダ。読めない物を移す・戻すのは常駐（アクションでない）。
// ブックは、folderRole が home・trash・unreadable・backyard・folder・binder のどれでもない行（"book" と、役の無い・読めない行 = 読めないブック）。どのフォルダに入っているかでは決めない

// フォルダの行の役（folderRole の値）
const (
	RoleHome       = "home"       // 書庫ホーム
	RoleTrash      = "trash"      // ゴミ箱
	RoleUnreadable = "unreadable" // 読めない物のフォルダ
	RoleBackyard   = "backyard"   // バックヤード
	RoleFolder     = "folder"     // フォルダ
	RoleBinder     = "binder"     // バインダ
	RoleBook       = "book"       // ブック
)

// エントリの種類（並びの要素の kind の値）
const (
	KindPage   = "page"
	KindBinder = "binder"
	KindBook   = "book"
	KindFolder = "folder"
)

// HomeID は、書庫ホームの id（決まった値）
const HomeID = "library-home"

// TrashID は、ゴミ箱の id（決まった値）
const TrashID = "library-trash"

// UnreadableID は、読めない物のフォルダの id（決まった値）
const UnreadableID = "library-unreadable"

// topFolder は、書庫の一番上のフォルダ（どのフォルダにも入らない）の役 1 つの、役 role と決まった id（ただ 1 つ在る物。バックヤードのように定義ごとに在る物は空）と、
// open（ページ・バインダ・ブック・フォルダの 4 つとも持てるか）と library（中の物が書庫に入るか）と shown（書庫の画面と AI の一覧に出るか）
type topFolder struct {
	role, id             string
	open, library, shown bool
}

// topFolders は、一番上のフォルダの表（web/src/core/folders.ts の TOP_FOLDERS と同じ表・同じ順）。一番上の役を見る所は、役の名前を並べずにこの表から引く
var topFolders = []topFolder{
	{RoleHome, HomeID, true, true, true},
	{RoleTrash, TrashID, true, true, true},
	{RoleUnreadable, UnreadableID, false, false, true},
	{RoleBackyard, "", false, true, false},
}

// IsTopRole は、フォルダの行の役 role（folderRole の値。無い・読めないなら空）が、書庫の一番上のフォルダの役か
func IsTopRole(role string) bool {
	return slices.ContainsFunc(topFolders, func(t topFolder) bool { return t.role == role })
}

// IsUnshownTopRole は、役 role が、書庫の画面と AI の一覧に出ない一番上の役か（バックヤード）
func IsUnshownTopRole(role string) bool {
	return slices.ContainsFunc(topFolders, func(t topFolder) bool { return t.role == role && !t.shown })
}

// IsOpenRole は、役 role が、ページ・バインダ・ブック・フォルダの 4 つとも持てる役か: 4 つとも持てる一番上の役（書庫ホーム・ゴミ箱）とフォルダ
func IsOpenRole(role string) bool {
	return role == RoleFolder || slices.ContainsFunc(topFolders, func(t topFolder) bool { return t.role == role && t.open })
}

// IsBookRole は、役 role が、ブックの役か（一番上の役でも、4 つとも持てる役でも、バインダでもない）
func IsBookRole(role string) bool { return !IsTopRole(role) && !IsOpenRole(role) && role != RoleBinder }

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
	return marshal(map[string]any{"folderRole": RoleHome, "id": HomeID, "lineup": lineup})
}

// TrashBody は、エントリ lineup（trashRef の形）を持つゴミ箱の本文
func TrashBody(lineup []json.RawMessage) json.RawMessage {
	if lineup == nil {
		lineup = []json.RawMessage{}
	}
	return marshal(map[string]any{"folderRole": RoleTrash, "id": TrashID, "lineup": lineup})
}

// UnreadableBody は、エントリ lineup を持つ読めない物のフォルダの本文
func UnreadableBody(lineup []json.RawMessage) json.RawMessage {
	if lineup == nil {
		lineup = []json.RawMessage{}
	}
	return marshal(map[string]any{"folderRole": RoleUnreadable, "id": UnreadableID, "lineup": lineup})
}

// trashRef は、ゴミ箱の並びのエントリ 1 つ（フィールドの順は保存の形と同じ）
type trashRef struct {
	Kind    string   `json:"kind"`
	ID      string   `json:"id"`
	Trashed string   `json:"trashed"`
	From    []string `json:"from"`
}

// RefOf は、id だけのエントリ（kind は "page"・"binder"・"book"・"folder"）
func RefOf(kind, id string) json.RawMessage { return refOf(kind, id) }

// roleSQL は、表 folders の行の役を読む SQL の式（本文が読めない行は NULL。json_extract は読めない本文で誤りになるので、先に確かめる）
const roleSQL = `CASE WHEN json_valid(body) THEN json_extract(body, '$.folderRole') END`

// notBookSQL は、ブックでないフォルダの行の id（一番上のフォルダ・フォルダ・バインダ。IsBookRole の逆）を選ぶ SQL
var notBookSQL = `SELECT id FROM folders WHERE ` + roleSQL + ` IN (` + notBookRolesSQL() + `)`

// notBookRolesSQL は、ブックでない役（一番上の役・フォルダ・バインダ）を SQL の文字の並びにした物
func notBookRolesSQL() string {
	roles := []string{RoleFolder, RoleBinder}
	for _, t := range topFolders {
		roles = append(roles, t.role)
	}
	quoted := make([]string, len(roles))
	for i, r := range roles {
		quoted[i] = "'" + r + "'"
	}
	return strings.Join(quoted, ", ")
}

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
		refs = append(refs, refOf(KindBook, id))
		if _, err := tx.Exec(`INSERT INTO entries (id, folder) VALUES (?, ?)`, id, old); err != nil {
			return err
		}
	}
	if err := put(old, marshal(map[string]any{"folderRole": RoleFolder, "id": old, "title": "旧ブック", "lineup": refs})); err != nil {
		return err
	}
	if _, err := tx.Exec(`INSERT INTO entries (id, folder) VALUES (?, ?)`, old, HomeID); err != nil {
		return err
	}
	return put(HomeID, HomeBody([]json.RawMessage{refOf(KindFolder, old)}))
}

// newUUID は、uuid の形の乱数（版 4）
func newUUID() string {
	var b [16]byte
	_, _ = rand.Read(b[:])
	b[6] = b[6]&0x0f | 0x40
	b[8] = b[8]&0x3f | 0x80
	return fmt.Sprintf("%x-%x-%x-%x-%x", b[0:4], b[4:6], b[6:8], b[8:10], b[10:16])
}
