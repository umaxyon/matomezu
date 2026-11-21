package storage

import (
	"path/filepath"
	"testing"
)

// 参加の要求の郵便（種類 join-request）は、種類の表と、伝えられる前の records の行の両方から消す。ほかの郵便とほかの種類はそのまま
func TestJoinRequestMailIsDropped(t *testing.T) {
	path := filepath.Join(t.TempDir(), "data.db")
	beforeMigration(t, path, 32,
		`INSERT INTO kinds (n, subject, spec) VALUES (1, '@matomezu/base:mail', '[]')`,
		`CREATE TABLE rec_1 (id TEXT PRIMARY KEY, body TEXT NOT NULL, version INTEGER NOT NULL, updated_at TEXT NOT NULL)`,
		`INSERT INTO rec_1 VALUES ('m1', '{"id":"m1","mail":"@matomezu/base:join-request"}', 1, 'x'), ('m2', '{"id":"m2","mail":"@matomezu/base:letter"}', 1, 'x')`,
		`INSERT INTO records VALUES ('@matomezu/base:mail', 'm3', '{"id":"m3","mail":"@matomezu/base:join-request"}', 1, 'x'),
			('@matomezu/base:mail', 'm4', '{"id":"m4","mail":"@matomezu/base:letter"}', 1, 'x'),
			('other', 'o1', '{"id":"o1","mail":"@matomezu/base:join-request"}', 1, 'x')`,
	)
	db := open(t, path).(*sqliteStorage).db
	ids := func(q string) []string {
		rows, err := db.Query(q)
		if err != nil {
			t.Fatal(err)
		}
		defer rows.Close()
		var out []string
		for rows.Next() {
			var id string
			if err := rows.Scan(&id); err != nil {
				t.Fatal(err)
			}
			out = append(out, id)
		}
		return out
	}
	if got := ids(`SELECT id FROM rec_1 ORDER BY id`); len(got) != 1 || got[0] != "m2" {
		t.Errorf("rec_1 = %v, want [m2]", got)
	}
	if got := ids(`SELECT id FROM records ORDER BY id`); len(got) != 2 || got[0] != "m4" || got[1] != "o1" {
		t.Errorf("records = %v, want [m4 o1]", got)
	}
}
