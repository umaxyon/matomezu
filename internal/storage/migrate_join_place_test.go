package storage

import (
	"path/filepath"
	"testing"
)

// 参加要求の郵便の orcaWorkspace は place に名前を替える。ほかの郵便と、orcaWorkspace の無い参加要求は変えない
func TestJoinRequestPlaces(t *testing.T) {
	path := filepath.Join(t.TempDir(), "data.db")
	beforeMigration(t, path, 34,
		`INSERT INTO kinds (n, subject, spec) VALUES (1, '@matomezu/base:mail', '[]')`,
		`CREATE TABLE rec_1 (id TEXT PRIMARY KEY, body TEXT NOT NULL, version INTEGER NOT NULL, updated_at TEXT NOT NULL)`,
		`INSERT INTO rec_1 VALUES
			('m1', '{"mail":"@matomezu/base:join-request","props":{"ai":"claude","orcaWorkspace":"5.M-0167"}}', 1, 'x'),
			('m2', '{"mail":"@matomezu/base:join-request","props":{"ai":"claude"}}', 1, 'x'),
			('m3', '{"mail":"@matomezu/base:other","props":{"orcaWorkspace":"x"}}', 1, 'x')`,
		`INSERT INTO records VALUES
			('@matomezu/base:mail', 'm4', '{"mail":"@matomezu/base:join-request","props":{"orcaWorkspace":"w"}}', 1, 'x')`,
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
		"m1": `{"mail":"@matomezu/base:join-request","props":{"ai":"claude","place":"5.M-0167"}}`,
		"m2": `{"mail":"@matomezu/base:join-request","props":{"ai":"claude"}}`,
		"m3": `{"mail":"@matomezu/base:other","props":{"orcaWorkspace":"x"}}`,
	} {
		if got := body(`SELECT body FROM rec_1 WHERE id = ?`, id); got != want {
			t.Errorf("%s: got %s, want %s", id, got, want)
		}
	}
	if got := body(`SELECT body FROM records WHERE id = ?`, "m4"); got != `{"mail":"@matomezu/base:join-request","props":{"place":"w"}}` {
		t.Errorf("m4: got %s", got)
	}
}
