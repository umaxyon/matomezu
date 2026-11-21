package storage

import (
	"path/filepath"
	"testing"
)

// 要求中の参加者の orcaWorkspace は place に名前を替え、持たない参加者は変えない
func TestParticipantPlaces(t *testing.T) {
	path := filepath.Join(t.TempDir(), "data.db")
	beforeMigration(t, path, 35,
		`INSERT INTO kinds (n, subject, spec) VALUES (1, '@matomezu/base:participant', '[]')`,
		`CREATE TABLE rec_1 (id TEXT PRIMARY KEY, body TEXT NOT NULL, version INTEGER NOT NULL, updated_at TEXT NOT NULL)`,
		`INSERT INTO rec_1 VALUES
			('p1', '{"id":"p1","orcaWorkspace":"5.M-0167","state":"requested"}', 1, 'x'),
			('p2', '{"id":"p2","state":"joined"}', 1, 'x')`,
		`INSERT INTO records VALUES ('@matomezu/base:participant', 'p3', '{"id":"p3","orcaWorkspace":"w"}', 1, 'x')`,
	)
	db := open(t, path).(*sqliteStorage).db
	body := func(q, id string) string {
		var b string
		if err := db.QueryRow(q, id).Scan(&b); err != nil {
			t.Fatal(err)
		}
		return b
	}
	for id, want := range map[string]string{
		"p1": `{"id":"p1","place":"5.M-0167","state":"requested"}`,
		"p2": `{"id":"p2","state":"joined"}`,
	} {
		if got := body(`SELECT body FROM rec_1 WHERE id = ?`, id); got != want {
			t.Errorf("%s: got %s, want %s", id, got, want)
		}
	}
	if got := body(`SELECT body FROM records WHERE id = ?`, "p3"); got != `{"id":"p3","place":"w"}` {
		t.Errorf("p3: got %s", got)
	}
}
