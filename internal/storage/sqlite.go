package storage

import (
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	_ "modernc.org/sqlite" // C を使わない SQLite（OS ごとの実行ファイルを 1 台から作れる）
)

// migrations は表の形の移り変わり。i 番目を行うと、表の形の版（PRAGMA user_version）が i+1 になる。足すのは末尾だけ
var migrations = []string{
	`CREATE TABLE books (
		id TEXT PRIMARY KEY,
		body TEXT NOT NULL,
		version INTEGER NOT NULL,
		updated_at TEXT NOT NULL
	);
	CREATE TABLE settings (
		user TEXT PRIMARY KEY,
		body TEXT NOT NULL,
		updated_at TEXT NOT NULL
	);`,
	// ブックを開いた時刻（ブックの id ごと。ブックのデータとは別に持ち、ブックの版は進めない）
	`CREATE TABLE opened (
		id TEXT PRIMARY KEY,
		at TEXT NOT NULL
	);`,
	// ゴミ箱に入れた時刻（NULL ならふつうのブック）
	`ALTER TABLE books ADD COLUMN trashed_at TEXT;`,
	// ゴミ箱に入れた時刻は、ブックのデータ（土台のフィールド trashed）に移す
	`UPDATE books SET body = json_set(body, '$.trashed', trashed_at) WHERE trashed_at IS NOT NULL;
	ALTER TABLE books DROP COLUMN trashed_at;`,
	// ブックごとのアノテーションの並び（ブックのデータとは別に持ち、ブックの版は進めない）
	`CREATE TABLE annotations (
		book TEXT PRIMARY KEY,
		body TEXT NOT NULL,
		updated_at TEXT NOT NULL
	);`,
	// 利用者ごとの郵便箱（郵便の並び。届いた順）
	`CREATE TABLE mailbox (
		user TEXT PRIMARY KEY,
		body TEXT NOT NULL,
		updated_at TEXT NOT NULL
	);`,
	// ブックごとの、AI 編集チケットの並び（まだ見られていない物と、見られる前に消えた物。ブックのデータとは別に持ち、ブックの版は進めない）
	`CREATE TABLE ai_edit_tickets (
		book TEXT PRIMARY KEY,
		body TEXT NOT NULL,
		updated_at TEXT NOT NULL
	);`,
	// 利用者ごとの参加者の表（参加者の並び。要求が届いた順）
	`CREATE TABLE participants (
		user TEXT PRIMARY KEY,
		body TEXT NOT NULL,
		updated_at TEXT NOT NULL
	);`,
	// 利用者ごとの、常駐だけが持つ参加者の記録（参加者の id ごとのセッション id と、参加を伝えたかの印）
	`CREATE TABLE participant_notes (
		user TEXT PRIMARY KEY,
		body TEXT NOT NULL,
		updated_at TEXT NOT NULL
	);`,
	// id が master の行を消す
	`DELETE FROM books WHERE id = 'master';
	DELETE FROM opened WHERE id = 'master';
	DELETE FROM annotations WHERE book = 'master';
	DELETE FROM ai_edit_tickets WHERE book = 'master';`,
	// ブックは土台のフィールド project、郵便は project、参加者は projects を持つ。project の無いブック・郵便・参加者は標準のプロジェクト default にする
	`UPDATE books SET body = json_set(body, '$.project', 'default') WHERE json_type(body, '$.project') IS NULL;
	UPDATE mailbox SET body = (SELECT json_group_array(json(CASE WHEN json_type(value, '$.project') IS NULL THEN json_set(value, '$.project', 'default') ELSE value END)) FROM json_each(mailbox.body));
	UPDATE participants SET body = (SELECT json_group_array(json(CASE WHEN json_type(value, '$.projects') IS NULL THEN json_set(value, '$.projects', json('["default"]')) ELSE value END)) FROM json_each(participants.body));`,
	// ワークルームの名前は 20 字まで。それより長い名前（参加者のワークルーム、参加の頼みの郵便の希望）は 20 字に切り詰める
	`UPDATE participants SET body = (SELECT json_group_array(json(CASE WHEN length(json_extract(value, '$.workroom')) > 20 THEN json_set(value, '$.workroom', trim(substr(json_extract(value, '$.workroom'), 1, 20))) ELSE value END)) FROM json_each(participants.body));
	UPDATE mailbox SET body = (SELECT json_group_array(json(CASE WHEN json_extract(value, '$.mail') = '@matomezu/base:join-request' AND length(json_extract(value, '$.props.workroom')) > 20 THEN json_set(value, '$.props.workroom', trim(substr(json_extract(value, '$.props.workroom'), 1, 20))) ELSE value END)) FROM json_each(mailbox.body));`,
	// ブック・郵便・参加者はプロジェクトを持たない。ブックと郵便の project、参加者の projects、参加の要求の郵便（join-request）の props の projects を外す
	`UPDATE books SET body = json_remove(body, '$.project');
	UPDATE mailbox SET body = (SELECT json_group_array(json(CASE WHEN json_extract(value, '$.mail') = '@matomezu/base:join-request' THEN json_remove(json_remove(value, '$.project'), '$.props.projects') ELSE json_remove(value, '$.project') END)) FROM json_each(mailbox.body));
	UPDATE participants SET body = (SELECT json_group_array(json(json_remove(value, '$.projects'))) FROM json_each(participants.body));`,
}

type sqliteStorage struct {
	db *sql.DB
}

// OpenSQLite は path の SQLite を開き（無ければ作り）、表の形を最新にする
func OpenSQLite(path string) (Storage, error) {
	// 道筋はそのまま渡す（file: の URI にすると、Windows の \ の道筋の読み方が変わる）
	db, err := sql.Open("sqlite", path)
	if err != nil {
		return nil, err
	}
	db.SetMaxOpenConns(1) // 書くのは常駐 1 つ。つなぎを 1 本にして、書く順を 1 列にする
	db.SetConnMaxIdleTime(0)
	for _, p := range []string{`PRAGMA busy_timeout = 5000`, `PRAGMA journal_mode = WAL`, `PRAGMA foreign_keys = ON`} {
		if _, err := db.Exec(p); err != nil {
			db.Close()
			return nil, err
		}
	}
	if err := migrate(db); err != nil {
		db.Close()
		return nil, err
	}
	return &sqliteStorage{db: db}, nil
}

func migrate(db *sql.DB) error {
	var have int
	if err := db.QueryRow(`PRAGMA user_version`).Scan(&have); err != nil {
		return err
	}
	if have > len(migrations) {
		return fmt.Errorf("the data was written by a newer matomezu (form %d, this one knows %d)", have, len(migrations))
	}
	for i := have; i < len(migrations); i++ {
		tx, err := db.Begin()
		if err != nil {
			return err
		}
		if _, err := tx.Exec(migrations[i]); err != nil {
			tx.Rollback()
			return err
		}
		if _, err := tx.Exec(fmt.Sprintf(`PRAGMA user_version = %d`, i+1)); err != nil {
			tx.Rollback()
			return err
		}
		if err := tx.Commit(); err != nil {
			return err
		}
	}
	return nil
}

// Stamp は時刻を、桁の決まった RFC 3339 の UTC にする（ミリ秒まで。文字のまま比べても新しい順になり、画面の toISOString と同じ形）
func Stamp(t time.Time) string { return t.UTC().Format("2006-01-02T15:04:05.000Z") }

func now() string { return Stamp(time.Now()) }

func (s *sqliteStorage) Touched() (map[string]string, error) {
	rows, err := s.db.Query(`SELECT id, MAX(t) FROM (SELECT id, updated_at AS t FROM books UNION ALL SELECT id, at AS t FROM opened) GROUP BY id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[string]string{}
	for rows.Next() {
		var id, at string
		if err := rows.Scan(&id, &at); err != nil {
			return nil, err
		}
		out[id] = at
	}
	return out, rows.Err()
}

func (s *sqliteStorage) Open(id, at string) error {
	_, err := s.db.Exec(`INSERT INTO opened (id, at) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET at = excluded.at`, id, at)
	return err
}

func (s *sqliteStorage) Books() ([]Book, error) {
	rows, err := s.db.Query(`SELECT id, body, version FROM books ORDER BY id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	books := []Book{}
	for rows.Next() {
		var b Book
		var body string
		if err := rows.Scan(&b.ID, &body, &b.Version); err != nil {
			return nil, err
		}
		b.Body = json.RawMessage(body)
		books = append(books, b)
	}
	return books, rows.Err()
}

func (s *sqliteStorage) PutBook(id string, body json.RawMessage, base int64) (int64, *Book, error) {
	var version int64
	have, err := s.apply(func(tx *sql.Tx) (*Book, error) {
		v, have, err := txPutBook(tx, id, body, base)
		version = v
		return have, err
	})
	return version, have, err
}

// apply は f を 1 つのトランザクションで行う（f が error を返したら巻き戻す。ErrConflict のときの置いてあるブックも返す）
func (s *sqliteStorage) apply(f func(tx *sql.Tx) (*Book, error)) (*Book, error) {
	tx, err := s.db.Begin()
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()
	have, err := f(tx)
	if err != nil {
		return have, err
	}
	return nil, tx.Commit()
}

func (s *sqliteStorage) Apply(b Batch) (*Book, error) {
	return s.apply(func(tx *sql.Tx) (*Book, error) {
		for _, w := range b.Books {
			if _, have, err := txPutBook(tx, w.ID, w.Body, w.Base); err != nil {
				return have, err
			}
		}
		for _, id := range b.Removed {
			if err := txDeleteBook(tx, id); err != nil {
				return nil, err
			}
		}
		for _, u := range []struct {
			table string
			body  *UserBody
		}{{"settings", b.Settings}, {"mailbox", b.Mailbox}, {"participants", b.Participants}} {
			if u.body == nil {
				continue
			}
			if err := txPutUser(tx, u.table, u.body.User, u.body.Body); err != nil {
				return nil, err
			}
		}
		for _, a := range b.Annotations {
			if err := txPutList(tx, "annotations", a.Book, a.Body); err != nil {
				return nil, err
			}
		}
		for _, t := range b.AIEditTickets {
			if err := txPutList(tx, "ai_edit_tickets", t.Book, t.Body); err != nil {
				return nil, err
			}
		}
		return nil, nil
	})
}

func txPutBook(tx *sql.Tx, id string, body json.RawMessage, base int64) (int64, *Book, error) {
	var have Book
	var haveBody string
	err := tx.QueryRow(`SELECT id, body, version FROM books WHERE id = ?`, id).Scan(&have.ID, &haveBody, &have.Version)
	switch {
	case errors.Is(err, sql.ErrNoRows):
		if base != 0 {
			return 0, nil, ErrConflict
		}
		if _, err := tx.Exec(`INSERT INTO books (id, body, version, updated_at) VALUES (?, ?, 1, ?)`, id, string(body), now()); err != nil {
			return 0, nil, err
		}
		return 1, nil, nil
	case err != nil:
		return 0, nil, err
	}
	if have.Version != base {
		have.Body = json.RawMessage(haveBody)
		return 0, &have, ErrConflict
	}
	next := base + 1
	if _, err := tx.Exec(`UPDATE books SET body = ?, version = ?, updated_at = ? WHERE id = ?`, string(body), next, now(), id); err != nil {
		return 0, nil, err
	}
	return next, nil, nil
}

// txPutUser は、利用者ごとの表 table（settings・mailbox・participants・participant_notes）の user の行を置き換える
func txPutUser(tx *sql.Tx, table, user string, body json.RawMessage) error {
	_, err := tx.Exec(`INSERT INTO `+table+` (user, body, updated_at) VALUES (?, ?, ?)
		ON CONFLICT(user) DO UPDATE SET body = excluded.body, updated_at = excluded.updated_at`, user, string(body), now())
	return err
}

// txPutList は、ブックごとの表 table（annotations・ai_edit_tickets）の book の行を置き換える（空の並びなら消す）
func txPutList(tx *sql.Tx, table, book string, body json.RawMessage) error {
	if empty(body) {
		_, err := tx.Exec(`DELETE FROM `+table+` WHERE book = ?`, book)
		return err
	}
	_, err := tx.Exec(`INSERT INTO `+table+` (book, body, updated_at) VALUES (?, ?, ?)
		ON CONFLICT(book) DO UPDATE SET body = excluded.body, updated_at = excluded.updated_at`, book, string(body), now())
	return err
}

func txDeleteBook(tx *sql.Tx, id string) error {
	for _, q := range []string{`DELETE FROM books WHERE id = ?`, `DELETE FROM opened WHERE id = ?`, `DELETE FROM annotations WHERE book = ?`, `DELETE FROM ai_edit_tickets WHERE book = ?`} {
		if _, err := tx.Exec(q, id); err != nil {
			return err
		}
	}
	return nil
}

func (s *sqliteStorage) DeleteBook(id string) error {
	_, err := s.apply(func(tx *sql.Tx) (*Book, error) { return nil, txDeleteBook(tx, id) })
	return err
}

func (s *sqliteStorage) Annotations() (map[string]json.RawMessage, error) {
	rows, err := s.db.Query(`SELECT book, body FROM annotations`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	all := map[string]json.RawMessage{}
	for rows.Next() {
		var book, body string
		if err := rows.Scan(&book, &body); err != nil {
			return nil, err
		}
		all[book] = json.RawMessage(body)
	}
	return all, rows.Err()
}

func (s *sqliteStorage) PutAnnotations(book string, body json.RawMessage) error {
	_, err := s.Apply(Batch{Annotations: []BookBody{{book, body}}})
	return err
}

func (s *sqliteStorage) AIEditTickets() (map[string]json.RawMessage, error) {
	rows, err := s.db.Query(`SELECT book, body FROM ai_edit_tickets`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	all := map[string]json.RawMessage{}
	for rows.Next() {
		var book, body string
		if err := rows.Scan(&book, &body); err != nil {
			return nil, err
		}
		all[book] = json.RawMessage(body)
	}
	return all, rows.Err()
}

func (s *sqliteStorage) PutAIEditTickets(book string, body json.RawMessage) error {
	_, err := s.Apply(Batch{AIEditTickets: []BookBody{{book, body}}})
	return err
}

// empty は、並びの JSON が空（[] か null）か
func empty(body json.RawMessage) bool {
	var list []json.RawMessage
	return json.Unmarshal(body, &list) == nil && len(list) == 0
}

func (s *sqliteStorage) Settings(user string) (json.RawMessage, error) {
	var body string
	err := s.db.QueryRow(`SELECT body FROM settings WHERE user = ?`, user).Scan(&body)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return json.RawMessage(body), nil
}

func (s *sqliteStorage) PutSettings(user string, body json.RawMessage) error {
	_, err := s.Apply(Batch{Settings: &UserBody{user, body}})
	return err
}

func (s *sqliteStorage) Mailbox(user string) (json.RawMessage, error) {
	var body string
	err := s.db.QueryRow(`SELECT body FROM mailbox WHERE user = ?`, user).Scan(&body)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return json.RawMessage(body), nil
}

func (s *sqliteStorage) PutMailbox(user string, body json.RawMessage) error {
	_, err := s.Apply(Batch{Mailbox: &UserBody{user, body}})
	return err
}

func (s *sqliteStorage) Participants(user string) (json.RawMessage, error) {
	var body string
	err := s.db.QueryRow(`SELECT body FROM participants WHERE user = ?`, user).Scan(&body)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return json.RawMessage(body), nil
}

func (s *sqliteStorage) PutParticipants(user string, body json.RawMessage) error {
	_, err := s.Apply(Batch{Participants: &UserBody{user, body}})
	return err
}

func (s *sqliteStorage) ParticipantNotes(user string) (json.RawMessage, error) {
	var body string
	err := s.db.QueryRow(`SELECT body FROM participant_notes WHERE user = ?`, user).Scan(&body)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return json.RawMessage(body), nil
}

func (s *sqliteStorage) PutParticipantNotes(user string, body json.RawMessage) error {
	_, err := s.apply(func(tx *sql.Tx) (*Book, error) { return nil, txPutUser(tx, "participant_notes", user, body) })
	return err
}

func (s *sqliteStorage) Close() error { return s.db.Close() }
