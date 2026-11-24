package storage

import (
	"path/filepath"
	"testing"
)

// listed を持たないペアリングしたホストは listed にし、もう値のある物とほかの種類は変えない。
// 種類の表と、伝えられる前の records の行の両方を直す
func TestPairedHostListedIsAdded(t *testing.T) {
	path := filepath.Join(t.TempDir(), "data.db")
	beforeMigration(t, path, 38,
		`INSERT INTO kinds (n, subject, spec) VALUES (2, '@matomezu/network:paired-host', '[]')`,
		`CREATE TABLE rec_2 (id TEXT PRIMARY KEY, body TEXT NOT NULL, version INTEGER NOT NULL, updated_at TEXT NOT NULL)`,
		`INSERT INTO rec_2 VALUES ('h1', '{"id":"h1"}', 1, 'x'), ('h2', '{"id":"h2","listed":"hidden"}', 1, 'x')`,
		`INSERT INTO records VALUES ('@matomezu/network:paired-host', 'h3', '{"id":"h3"}', 1, 'x'), ('other', 'o1', '{"id":"o1"}', 1, 'x')`,
	)
	db := open(t, path).(*sqliteStorage).db
	body := func(q string) string {
		var b string
		if err := db.QueryRow(q).Scan(&b); err != nil {
			t.Fatal(err)
		}
		return b
	}
	want := map[string]string{
		`SELECT body FROM rec_2 WHERE id = 'h1'`:   `{"id":"h1","listed":"listed"}`,
		`SELECT body FROM rec_2 WHERE id = 'h2'`:   `{"id":"h2","listed":"hidden"}`,
		`SELECT body FROM records WHERE id = 'h3'`: `{"id":"h3","listed":"listed"}`,
		`SELECT body FROM records WHERE id = 'o1'`: `{"id":"o1"}`,
	}
	for q, w := range want {
		if got := body(q); got != w {
			t.Errorf("%s: got %s, want %s", q, got, w)
		}
	}
}
