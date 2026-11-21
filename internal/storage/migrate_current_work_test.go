package storage

import (
	"path/filepath"
	"testing"
)

// カレントワークの無いワークルームに、担当に入っていて作業中のレーンにあるチケットのうち、更新の新しい物を書く。
// 作業中でないレーン・作業中のレーンの無いプロジェクトのチケットは選ばず、もうカレントワークのあるワークルームには書かない
func TestCurrentWorksAreFilled(t *testing.T) {
	path := filepath.Join(t.TempDir(), "data.db")
	beforeMigration(t, path, 33,
		`INSERT INTO kinds (n, subject, spec) VALUES (1, '@matomezu/taskboard:ticket', '[]')`,
		`CREATE TABLE rec_1 (id TEXT PRIMARY KEY, body TEXT NOT NULL, version INTEGER NOT NULL, updated_at TEXT NOT NULL)`,
		`INSERT INTO rec_1 VALUES
			('t1', '{"id":"t1","project":"p1","number":1,"lane":"doing","assignees":["a","b"],"updatedAt":"2026-11-01"}', 1, 'x'),
			('t2', '{"id":"t2","project":"p1","number":2,"lane":"doing","assignees":["a"],"updatedAt":"2026-11-02"}', 1, 'x'),
			('t3', '{"id":"t3","project":"p1","number":3,"lane":"todo","assignees":["c"],"updatedAt":"2026-11-03"}', 1, 'x'),
			('t4', '{"id":"t4","project":"p2","number":1,"lane":"doing","assignees":["d"],"updatedAt":"2026-11-03"}', 1, 'x'),
			('t5', '{"id":"t5","project":"p1","number":5,"lane":"doing","assignees":["e"],"updatedAt":"2026-11-03"}', 1, 'x')`,
		`INSERT INTO records VALUES
			('@matomezu/taskboard:project', 'p1', '{"id":"p1","lanes":[{"kind":"lane","id":"todo"},{"kind":"lane","id":"doing","working":true},{"kind":"unsorted","shown":true}]}', 1, 'x'),
			('@matomezu/taskboard:project', 'p2', '{"id":"p2","lanes":[{"kind":"lane","id":"doing"}]}', 1, 'x'),
			('@matomezu/taskboard:current-work', 'e', '{"id":"e","ticket":"none"}', 1, 'x')`,
	)
	db := open(t, path).(*sqliteStorage).db
	rows, err := db.Query(`SELECT id, body FROM records WHERE subject = '@matomezu/taskboard:current-work' ORDER BY id`)
	if err != nil {
		t.Fatal(err)
	}
	defer rows.Close()
	got := map[string]string{}
	for rows.Next() {
		var id, body string
		if err := rows.Scan(&id, &body); err != nil {
			t.Fatal(err)
		}
		got[id] = body
	}
	want := map[string]string{
		"a": `{"id":"a","ticket":"t2"}`,
		"b": `{"id":"b","ticket":"t1"}`,
		"e": `{"id":"e","ticket":"none"}`,
	}
	if len(got) != len(want) {
		t.Fatalf("current works = %v", got)
	}
	for id, w := range want {
		if got[id] != w {
			t.Errorf("%s: got %s, want %s", id, got[id], w)
		}
	}
}
