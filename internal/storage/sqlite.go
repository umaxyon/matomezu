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
}

type sqliteStorage struct {
	db *sql.DB
}

// OpenSQLite は path の SQLite を開き（無ければ作り）、表の形を最新にする
func OpenSQLite(path string) (Storage, error) {
	db, err := sql.Open("sqlite", "file:"+path+"?_pragma=busy_timeout(5000)&_pragma=journal_mode(WAL)&_pragma=foreign_keys(1)")
	if err != nil {
		return nil, err
	}
	db.SetMaxOpenConns(1) // 書くのは常駐 1 つ。つなぎを 1 本にして、書く順を 1 列にする
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

func now() string { return time.Now().UTC().Format(time.RFC3339Nano) }

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
	tx, err := s.db.Begin()
	if err != nil {
		return 0, nil, err
	}
	defer tx.Rollback()
	var have Book
	var haveBody string
	err = tx.QueryRow(`SELECT id, body, version FROM books WHERE id = ?`, id).Scan(&have.ID, &haveBody, &have.Version)
	switch {
	case errors.Is(err, sql.ErrNoRows):
		if base != 0 {
			return 0, nil, ErrConflict
		}
		if _, err := tx.Exec(`INSERT INTO books (id, body, version, updated_at) VALUES (?, ?, 1, ?)`, id, string(body), now()); err != nil {
			return 0, nil, err
		}
		return 1, nil, tx.Commit()
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
	return next, nil, tx.Commit()
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
	_, err := s.db.Exec(`INSERT INTO settings (user, body, updated_at) VALUES (?, ?, ?)
		ON CONFLICT(user) DO UPDATE SET body = excluded.body, updated_at = excluded.updated_at`, user, string(body), now())
	return err
}

func (s *sqliteStorage) Close() error { return s.db.Close() }
