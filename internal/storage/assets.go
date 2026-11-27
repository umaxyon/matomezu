package storage

// アセット: 画像のバイト列を、中身で決まる id（sha256）で持つ置き場。ブックのデータではなく、書き換えない。
// 中を解釈しない（種類・幅・高さは、置く側が見分けて渡す）

import (
	"database/sql"
	"errors"
	"strings"
)

// Asset は、アセット 1 つ（Bytes は中身。CreatedAt は初めて置いた時刻）
type Asset struct {
	ID        string
	Mime      string
	Width     int
	Height    int
	Bytes     []byte
	CreatedAt string
}

func (s *sqliteStorage) PutAsset(a Asset) error {
	_, err := s.db.Exec(`INSERT OR IGNORE INTO assets (id, mime, width, height, bytes, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
		a.ID, a.Mime, a.Width, a.Height, a.Bytes, a.CreatedAt)
	return err
}

func (s *sqliteStorage) Asset(id string) (*Asset, error) {
	a := Asset{ID: id}
	err := s.db.QueryRow(`SELECT mime, width, height, bytes, created_at FROM assets WHERE id = ?`, id).
		Scan(&a.Mime, &a.Width, &a.Height, &a.Bytes, &a.CreatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &a, nil
}

func (s *sqliteStorage) AssetIDs() ([]string, error) {
	rows, err := s.db.Query(`SELECT id FROM assets ORDER BY id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []string{}
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		out = append(out, id)
	}
	return out, rows.Err()
}

func (s *sqliteStorage) RemoveAssets(ids []string) error {
	if len(ids) == 0 {
		return nil
	}
	return s.apply(func(tx *sql.Tx) error {
		args := make([]any, len(ids))
		for i, id := range ids {
			args[i] = id
		}
		_, err := tx.Exec(`DELETE FROM assets WHERE id IN (?`+strings.Repeat(", ?", len(ids)-1)+`)`, args...)
		return err
	})
}
