package storage

import (
	"path/filepath"
	"testing"
)

// 古い current-ticket の種類のレコードは、種類の表・kinds の行・伝えられる前の records の行ごと捨て、ほかの種類は残す
func TestCurrentTicketsAreDropped(t *testing.T) {
	path := filepath.Join(t.TempDir(), "data.db")
	beforeMigration(t, path, 28,
		`INSERT INTO kinds (n, subject, spec) VALUES (1, '@matomezu/taskboard:current-ticket', '[]'), (2, 'other', '[]')`,
		`CREATE TABLE rec_1 (id TEXT PRIMARY KEY, body TEXT NOT NULL, version INTEGER NOT NULL, updated_at TEXT NOT NULL)`,
		`CREATE TABLE rec_2 (id TEXT PRIMARY KEY, body TEXT NOT NULL, version INTEGER NOT NULL, updated_at TEXT NOT NULL)`,
		`INSERT INTO rec_1 VALUES ('w1', '{"id":"w1","ticket":"t1","at":"x"}', 1, 'x')`,
		`INSERT INTO rec_2 VALUES ('o1', '{}', 1, 'x')`,
		`INSERT INTO records VALUES ('@matomezu/taskboard:current-ticket', 'w2', '{}', 1, 'x'), ('kept', 'k1', '{}', 1, 'x')`,
	)
	db := open(t, path).(*sqliteStorage).db
	count := func(q string) int {
		var n int
		if err := db.QueryRow(q).Scan(&n); err != nil {
			t.Fatal(err)
		}
		return n
	}
	if n := count(`SELECT COUNT(*) FROM kinds WHERE subject = '@matomezu/taskboard:current-ticket'`); n != 0 {
		t.Fatalf("kinds = %d", n)
	}
	if n := count(`SELECT COUNT(*) FROM sqlite_master WHERE name = 'rec_1'`); n != 0 {
		t.Fatal("rec_1 is still there")
	}
	if n := count(`SELECT COUNT(*) FROM records WHERE subject = '@matomezu/taskboard:current-ticket'`); n != 0 {
		t.Fatalf("records = %d", n)
	}
	if count(`SELECT COUNT(*) FROM rec_2`) != 1 || count(`SELECT COUNT(*) FROM records`) != 1 || count(`SELECT COUNT(*) FROM kinds`) != 1 {
		t.Fatal("other kinds were changed")
	}
}
