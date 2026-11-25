package storage

import (
	"path/filepath"
	"testing"
)

// ページの設定から page-text-colors の値だけを外し、ほかの項目の順と値は残して版を 1 上げる。項目が残らなければ settings ごと外す。
// 持たないページは変えない
func TestPageTextColorsAreDropped(t *testing.T) {
	path := filepath.Join(t.TempDir(), "data.db")
	beforeMigration(t, path, 41,
		`INSERT INTO pages VALUES
			('p1', '{"id":"p1","settings":{"@matomezu/base:page-theme":"t","@matomezu/base:page-text-colors":{"@matomezu/base:warn":"#111111"},"@matomezu/line:line-route":"elbow"},"title":"1"}', 3, 'x'),
			('p2', '{"id":"p2","settings":{"@matomezu/base:page-text-colors":{}},"title":"2"}', 1, 'x'),
			('p3', '{"id":"p3","settings":{"@matomezu/base:page-theme":"t"}}', 5, 'x')`,
	)
	db := open(t, path).(*sqliteStorage).db
	want := map[string]struct {
		body    string
		version int
	}{
		"p1": {`{"id":"p1","settings":{"@matomezu/base:page-theme":"t","@matomezu/line:line-route":"elbow"},"title":"1"}`, 4},
		"p2": {`{"id":"p2","title":"2"}`, 2},
		"p3": {`{"id":"p3","settings":{"@matomezu/base:page-theme":"t"}}`, 5},
	}
	for id, w := range want {
		var body string
		var version int
		if err := db.QueryRow(`SELECT body, version FROM pages WHERE id = ?`, id).Scan(&body, &version); err != nil {
			t.Fatal(err)
		}
		if body != w.body || version != w.version {
			t.Errorf("%s: got %s (%d), want %s (%d)", id, body, version, w.body, w.version)
		}
	}
}
