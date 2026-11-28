package storage

import (
	"path/filepath"
	"testing"
)

// 今の作業の写し work の無いワークルームに、カレントワークのチケットを書く。担当でない・作業中の印の無いレーンにある（印を外した・完了した）・無いチケットと、
// もう写しのあるワークルームには書かない
func TestWorkroomWorksAreFilled(t *testing.T) {
	path := filepath.Join(t.TempDir(), "data.db")
	beforeMigration(t, path, 45,
		`INSERT INTO records VALUES
			('@matomezu/taskboard:project', 'p1', '{"id":"p1","lanes":[{"kind":"lane","id":"todo"},{"kind":"lane","id":"doing","working":true},{"kind":"lane","id":"done"}]}', 1, 'x'),
			('@matomezu/taskboard:ticket', 't1', '{"id":"t1","project":"p1","lane":"doing","assignees":["a"]}', 1, 'x'),
			('@matomezu/taskboard:ticket', 't2', '{"id":"t2","project":"p1","lane":"todo","assignees":["b"]}', 1, 'x'),
			('@matomezu/taskboard:ticket', 't3', '{"id":"t3","project":"p1","lane":"done","assignees":[]}', 1, 'x'),
			('@matomezu/taskboard:ticket', 't4', '{"id":"t4","project":"p1","lane":"doing","assignees":["e"]}', 1, 'x'),
			('@matomezu/taskboard:current-work', 'a', '{"id":"a","ticket":"t1"}', 1, 'x'),
			('@matomezu/taskboard:current-work', 'b', '{"id":"b","ticket":"t2"}', 1, 'x'),
			('@matomezu/taskboard:current-work', 'c', '{"id":"c","ticket":"t3"}', 1, 'x'),
			('@matomezu/taskboard:current-work', 'd', '{"id":"d","ticket":"gone"}', 1, 'x'),
			('@matomezu/taskboard:current-work', 'e', '{"id":"e","ticket":"t4"}', 1, 'x'),
			('@matomezu/base:workroom', 'a', '{"id":"a","name":"A"}', 1, 'x'),
			('@matomezu/base:workroom', 'b', '{"id":"b","name":"B"}', 1, 'x'),
			('@matomezu/base:workroom', 'c', '{"id":"c","name":"C"}', 1, 'x'),
			('@matomezu/base:workroom', 'd', '{"id":"d","name":"D"}', 1, 'x'),
			('@matomezu/base:workroom', 'e', '{"id":"e","name":"E","work":{"subject":"@matomezu/taskboard:ticket","id":"t9"}}', 1, 'x')`,
	)
	db := open(t, path).(*sqliteStorage).db
	rows, err := db.Query(`SELECT id, json_extract(body, '$.work.id') FROM records WHERE subject = '@matomezu/base:workroom' ORDER BY id`)
	if err != nil {
		t.Fatal(err)
	}
	defer rows.Close()
	got := map[string]string{}
	for rows.Next() {
		var id string
		var work *string
		if err := rows.Scan(&id, &work); err != nil {
			t.Fatal(err)
		}
		if work != nil {
			got[id] = *work
		}
	}
	if len(got) != 2 || got["a"] != "t1" || got["e"] != "t9" {
		t.Fatalf("works = %v", got)
	}
}
