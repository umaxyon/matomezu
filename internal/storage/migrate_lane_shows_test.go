package storage

import (
	"path/filepath"
	"testing"
)

// laneShows を持たないプロジェクトは { count: true } にし、もう値のある物とほかの種類は変えない。
// 種類の表と、伝えられる前の records の行の両方を直す
func TestLaneShowsIsAdded(t *testing.T) {
	path := filepath.Join(t.TempDir(), "data.db")
	beforeMigration(t, path, 36,
		`INSERT INTO kinds (n, subject, spec) VALUES (2, '@matomezu/taskboard:project', '[]')`,
		`CREATE TABLE rec_2 (id TEXT PRIMARY KEY, body TEXT NOT NULL, version INTEGER NOT NULL, updated_at TEXT NOT NULL)`,
		`INSERT INTO rec_2 VALUES ('p1', '{"id":"p1"}', 1, 'x'), ('p2', '{"id":"p2","laneShows":{"count":false}}', 1, 'x')`,
		`INSERT INTO records VALUES ('@matomezu/taskboard:project', 'p3', '{"id":"p3"}', 1, 'x'), ('other', 'o1', '{"id":"o1"}', 1, 'x')`,
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
		`SELECT body FROM rec_2 WHERE id = 'p1'`:   `{"id":"p1","laneShows":{"count":true}}`,
		`SELECT body FROM rec_2 WHERE id = 'p2'`:   `{"id":"p2","laneShows":{"count":false}}`,
		`SELECT body FROM records WHERE id = 'p3'`: `{"id":"p3","laneShows":{"count":true}}`,
		`SELECT body FROM records WHERE id = 'o1'`: `{"id":"o1"}`,
	}
	for q, w := range want {
		if got := body(q); got != w {
			t.Errorf("%s: got %s, want %s", q, got, w)
		}
	}
}
