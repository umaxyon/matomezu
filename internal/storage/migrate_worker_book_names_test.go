package storage

import (
	"path/filepath"
	"testing"
)

// ワーカーブックの名前は写し元の今の名前（チケットの番号・ワークルームの名前）にし、チケットのブックの中のページ（バインダの中も）の名前の頭の番号を外す。
// 外すと空になる名前・すぐ後ろが数字の名前・ワークルームのブックのページ・バックヤードの外のブックは変えない
func TestWorkerBookNamesAreFixed(t *testing.T) {
	path := filepath.Join(t.TempDir(), "data.db")
	beforeMigration(t, path, 42,
		`INSERT INTO kinds (n, subject, spec) VALUES (2, '@matomezu/taskboard:project', '[]'), (3, '@matomezu/taskboard:ticket', '[]'), (4, '@matomezu/base:workroom', '[]')`,
		`CREATE TABLE rec_2 (id TEXT PRIMARY KEY, body TEXT NOT NULL, version INTEGER NOT NULL, updated_at TEXT NOT NULL)`,
		`CREATE TABLE rec_3 (id TEXT PRIMARY KEY, body TEXT NOT NULL, version INTEGER NOT NULL, updated_at TEXT NOT NULL)`,
		`CREATE TABLE rec_4 (id TEXT PRIMARY KEY, body TEXT NOT NULL, version INTEGER NOT NULL, updated_at TEXT NOT NULL)`,
		`INSERT INTO rec_2 VALUES ('pj', '{"id":"pj","prefix":"X-"}', 1, 'x')`,
		`INSERT INTO rec_3 VALUES ('t7', '{"id":"t7","project":"pj","number":7}', 1, 'x')`,
		`INSERT INTO rec_4 VALUES ('w1', '{"id":"w1","name":"sub10"}', 1, 'x')`,
		`INSERT INTO folders (id, body, version, updated_at) VALUES
			('yard', '{"folderRole":"backyard","id":"yard","backyard":"@matomezu/base:tickets-history","lineup":[{"kind":"book","id":"bt","workKey":{"subject":"@matomezu/taskboard:ticket","id":"t7"}},{"kind":"book","id":"bw","workKey":{"subject":"@matomezu/base:workroom","id":"w1"}}]}', 1, 'x'),
			('bt', '{"folderRole":"book","id":"bt","title":"M-0007","lineup":[{"kind":"page","id":"p1"},{"kind":"page","id":"p2"},{"kind":"binder","id":"bd"},{"kind":"page","id":"p4"}]}', 1, 'x'),
			('bd', '{"folderRole":"binder","id":"bd","title":"綴じ","lineup":[{"kind":"page","id":"p3"}]}', 1, 'x'),
			('bw', '{"folderRole":"book","id":"bw","title":"sub9","lineup":[{"kind":"page","id":"p5"}]}', 1, 'x'),
			('out', '{"folderRole":"book","id":"out","title":"X-0007","lineup":[{"kind":"page","id":"p6"}]}', 1, 'x')`,
		`INSERT INTO pages (id, body, version, updated_at) VALUES
			('p1', '{"id":"p1","title":"X-0007 の相談 1: 案"}', 1, 'x'),
			('p2', '{"id":"p2","title":"X-0007"}', 1, 'x'),
			('p3', '{"id":"p3","title":"X-0007 案と問い"}', 1, 'x'),
			('p4', '{"id":"p4","title":"X-00071 別の物"}', 1, 'x'),
			('p5', '{"id":"p5","title":"sub10 のメモ"}', 1, 'x'),
			('p6', '{"id":"p6","title":"X-0007 外"}', 1, 'x')`,
	)
	db := open(t, path).(*sqliteStorage).db
	want := map[string]string{
		`SELECT json_extract(body, '$.title') || ' v' || version FROM folders WHERE id = 'bt'`:  "X-0007 v2",
		`SELECT json_extract(body, '$.title') || ' v' || version FROM folders WHERE id = 'bw'`:  "sub10 v2",
		`SELECT json_extract(body, '$.title') || ' v' || version FROM folders WHERE id = 'out'`: "X-0007 v1",
		`SELECT json_extract(body, '$.title') || ' v' || version FROM pages WHERE id = 'p1'`:    "相談 1: 案 v2",
		`SELECT json_extract(body, '$.title') || ' v' || version FROM pages WHERE id = 'p2'`:    "X-0007 v1",
		`SELECT json_extract(body, '$.title') || ' v' || version FROM pages WHERE id = 'p3'`:    "案と問い v2",
		`SELECT json_extract(body, '$.title') || ' v' || version FROM pages WHERE id = 'p4'`:    "X-00071 別の物 v1",
		`SELECT json_extract(body, '$.title') || ' v' || version FROM pages WHERE id = 'p5'`:    "sub10 のメモ v1",
		`SELECT json_extract(body, '$.title') || ' v' || version FROM pages WHERE id = 'p6'`:    "X-0007 外 v1",
	}
	for q, w := range want {
		var got string
		if err := db.QueryRow(q).Scan(&got); err != nil {
			t.Fatal(err)
		}
		if got != w {
			t.Errorf("%s: got %q, want %q", q, got, w)
		}
	}
}
