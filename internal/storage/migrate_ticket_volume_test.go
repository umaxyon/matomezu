package storage

import (
	"path/filepath"
	"testing"
)

// 規模を持たないチケットは none に、cardShows に volume を持たないプロジェクトは true にし、もう値のある物とほかの種類は変えない。
// 種類の表と、伝えられる前の records の行の両方を直す
func TestTicketVolumeIsAdded(t *testing.T) {
	path := filepath.Join(t.TempDir(), "data.db")
	beforeMigration(t, path, 29,
		`INSERT INTO kinds (n, subject, spec) VALUES (1, '@matomezu/taskboard:ticket', '[]'), (2, '@matomezu/taskboard:project', '[]')`,
		`CREATE TABLE rec_1 (id TEXT PRIMARY KEY, body TEXT NOT NULL, version INTEGER NOT NULL, updated_at TEXT NOT NULL)`,
		`CREATE TABLE rec_2 (id TEXT PRIMARY KEY, body TEXT NOT NULL, version INTEGER NOT NULL, updated_at TEXT NOT NULL)`,
		`INSERT INTO rec_1 VALUES ('t1', '{"id":"t1","priority":"high"}', 1, 'x'), ('t2', '{"id":"t2","volume":"l"}', 1, 'x')`,
		`INSERT INTO rec_2 VALUES ('p1', '{"id":"p1","cardShows":{"priority":false}}', 1, 'x'), ('p2', '{"id":"p2","cardShows":{"priority":true,"volume":false}}', 1, 'x')`,
		`INSERT INTO records VALUES ('@matomezu/taskboard:ticket', 't3', '{"id":"t3"}', 1, 'x'), ('other', 'o1', '{"id":"o1"}', 1, 'x')`,
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
		`SELECT body FROM rec_1 WHERE id = 't1'`:   `{"id":"t1","priority":"high","volume":"none"}`,
		`SELECT body FROM rec_1 WHERE id = 't2'`:   `{"id":"t2","volume":"l"}`,
		`SELECT body FROM rec_2 WHERE id = 'p1'`:   `{"cardShows":{"priority":false,"volume":true},"id":"p1"}`,
		`SELECT body FROM rec_2 WHERE id = 'p2'`:   `{"id":"p2","cardShows":{"priority":true,"volume":false}}`,
		`SELECT body FROM records WHERE id = 't3'`: `{"id":"t3","volume":"none"}`,
		`SELECT body FROM records WHERE id = 'o1'`: `{"id":"o1"}`,
	}
	for q, w := range want {
		if got := body(q); got != w {
			t.Errorf("%s: got %s, want %s", q, got, w)
		}
	}
}
