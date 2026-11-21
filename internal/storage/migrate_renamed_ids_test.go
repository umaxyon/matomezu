package storage

import (
	"path/filepath"
	"testing"
)

// 名前を変えた id は、本文の中で値が丸ごと同じ所だけ変わる（ページのタイプ・バインダのページのタイプ・ディレクトリ構成図のアイコン・設定のキー）。
// 文の中の id（\" で囲んだ物も） とほかの値、キーの順は変えず、変えたページとフォルダの版を 1 上げる
func TestRenamedIDsAreRewritten(t *testing.T) {
	path := filepath.Join(t.TempDir(), "data.db")
	beforeMigration(t, path, 32,
		`INSERT INTO pages VALUES
			('s1', '{"kind":"page","id":"s1","type":"@matomezu/slide-book:slide","title":"@matomezu/slide-book:slide のこと","note":"\"@matomezu/slide-book:slide\""}', 3, 'x'),
			('d1', '{"kind":"page","id":"d1","type":"@matomezu/dir:dir","content":{"root":{"id":"r","kind":"folder","icon":"@matomezu/dir:entry-icon-book","children":[{"id":"a","kind":"file","icon":"@matomezu/slide-book:entry-icon"},{"id":"b","kind":"file","icon":"@matomezu/drawing:entry-icon"}]}}}', 1, 'x'),
			('m1', '{"kind":"page","id":"m1","type":"@matomezu/markdown:markdown"}', 5, 'x')`,
		`INSERT INTO folders VALUES ('f1', '{"pageType":"@matomezu/slide-book:slide","title":"スライド"}', 2, 'x')`,
		`INSERT INTO settings VALUES ('u', '{"keys":{"@matomezu/dir:entry-rename":["F2"]},"bound":"@matomezu/dir:entry-rename"}', 'x')`,
	)
	db := open(t, path).(*sqliteStorage).db
	row := func(q, id string) (string, int) {
		var body string
		var version int
		if err := db.QueryRow(q, id).Scan(&body, &version); err != nil {
			t.Fatal(err)
		}
		return body, version
	}
	cases := []struct {
		q, id, body string
		version     int
	}{
		{`SELECT body, version FROM pages WHERE id = ?`, "s1", `{"kind":"page","id":"s1","type":"@matomezu/slide-page:slide","title":"@matomezu/slide-book:slide のこと","note":"\"@matomezu/slide-book:slide\""}`, 4},
		{`SELECT body, version FROM pages WHERE id = ?`, "d1", `{"kind":"page","id":"d1","type":"@matomezu/dir:dir","content":{"root":{"id":"r","kind":"folder","icon":"@matomezu/dir:node-icon-book","children":[{"id":"a","kind":"file","icon":"@matomezu/slide-page:node-icon"},{"id":"b","kind":"file","icon":"@matomezu/drawing:node-icon"}]}}}`, 2},
		{`SELECT body, version FROM pages WHERE id = ?`, "m1", `{"kind":"page","id":"m1","type":"@matomezu/markdown:markdown"}`, 5},
		{`SELECT body, version FROM folders WHERE id = ?`, "f1", `{"pageType":"@matomezu/slide-page:slide","title":"スライド"}`, 3},
		{`SELECT body, 0 FROM settings WHERE user = ?`, "u", `{"keys":{"@matomezu/dir:node-rename":["F2"]},"bound":"@matomezu/dir:node-rename"}`, 0},
	}
	for _, c := range cases {
		if body, version := row(c.q, c.id); body != c.body || version != c.version {
			t.Errorf("%s: %s (version %d), want %s (version %d)", c.id, body, version, c.body, c.version)
		}
	}
}
