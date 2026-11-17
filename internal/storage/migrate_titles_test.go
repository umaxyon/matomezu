package storage

import (
	"database/sql"
	"path/filepath"
	"slices"
	"testing"
)

// titlesMigration は、重なる名前に番号を足す足し方の番号
const titlesMigration = 27

// sameTitles は、名前の重なるエントリを持つ書庫:
//   - 書庫ホーム: ブック x1・x2・x3（どれも「A」）、フォルダ d1、ブック t3（「T」）、本文の読めないブック u1、title が文字でないブック u2、ページ q1（「A 2」）・q2（「T」）、バインダ n1（「A」）
//   - フォルダ d1（「F」）: ブック y1（「B」）・y2（「B 2」）・y3（「B」）、フォルダ d2・ブック y4（どちらも「本 <&>」）、行の無いブック z9
//   - ブック y1: ページ r1・r2（どちらも「P」）
//   - ゴミ箱: ブック t1・t2（どちらも「T」）、フォルダ d3（「T」）
//   - ゴミ箱の中のフォルダ d3: ブック w1・w2（どちらも「W」）
var sameTitles = []string{
	`UPDATE folders SET version = 1, updated_at = 't-home',
		body = '{"folderRole":"home","id":"library-home","lineup":[{"kind":"book","id":"x1"},{"kind":"book","id":"x2"},{"kind":"book","id":"x3"},{"kind":"folder","id":"d1"},{"kind":"book","id":"t3"},{"kind":"book","id":"u1"},{"kind":"book","id":"u2"},{"kind":"page","id":"q1"},{"kind":"page","id":"q2"},{"kind":"binder","id":"n1"}]}'
		WHERE id = 'library-home'`,
	`UPDATE folders SET version = 1, updated_at = 't-trash',
		body = '{"folderRole":"trash","id":"library-trash","lineup":[{"kind":"book","id":"t1","trashed":"2026-11-01T00:00:00.000Z","from":["library-home"]},{"kind":"book","id":"t2","trashed":"2026-11-02T00:00:00.000Z","from":["library-home"]},{"kind":"folder","id":"d3","trashed":"2026-11-03T00:00:00.000Z","from":["library-home"]}]}'
		WHERE id = 'library-trash'`,
	`INSERT INTO pages (id, body, version, updated_at) VALUES
		('q1', '{"title":"A 2","kind":"page","id":"q1"}', 1, 't'),
		('q2', '{"kind":"page","title":"T","id":"q2"}', 3, 't'),
		('r1', '{"kind":"page","title":"P","id":"r1"}', 1, 't'),
		('r2', '{"kind":"page","title":"P","id":"r2"}', 1, 't')`,
	`INSERT INTO folders (id, body, version, updated_at) VALUES
		('x1', '{"title":"A","folderRole":"book","id":"x1","lineup":[]}', 1, 't'),
		('x2', '{"title":"A","folderRole":"book","id":"x2","lineup":[]}', 2, 't'),
		('x3', '{"title":"A","folderRole":"book","id":"x3","lineup":[]}', 3, 't'),
		('n1', '{"folderRole":"binder","id":"n1","title":"A","pageType":"t","lineup":[]}', 1, 't'),
		('d1', '{"folderRole":"folder","id":"d1","title":"F","lineup":[{"kind":"book","id":"y1"},{"kind":"book","id":"y2"},{"kind":"book","id":"y3"},{"kind":"folder","id":"d2"},{"kind":"book","id":"y4"},{"kind":"book","id":"z9"}]}', 1, 't'),
		('y1', '{"folderRole":"book","id":"y1","title":"B","lineup":[{"kind":"page","id":"r1"},{"kind":"page","id":"r2"}]}', 1, 't'),
		('y2', '{"folderRole":"book","id":"y2","title":"B 2","lineup":[]}', 1, 't'),
		('y3', '{"folderRole":"book","id":"y3","title":"B","lineup":[]}', 1, 't'),
		('d2', '{"folderRole":"folder","id":"d2","title":"本 <&>","lineup":[]}', 1, 't'),
		('y4', '{"folderRole":"book","id":"y4","title":"本 <&>","lineup":[],"locked":true}', 1, 't'),
		('t1', '{"folderRole":"book","id":"t1","title":"T","lineup":[]}', 1, 't'),
		('t2', '{"folderRole":"book","id":"t2","title":"T","lineup":[]}', 1, 't'),
		('d3', '{"folderRole":"folder","id":"d3","title":"T","lineup":[{"kind":"book","id":"w1"},{"kind":"book","id":"w2"}]}', 1, 't'),
		('w1', '{"folderRole":"book","id":"w1","title":"W","lineup":[]}', 1, 't'),
		('w2', '{"folderRole":"book","id":"w2","title":"W","lineup":[]}', 1, 't'),
		('t3', '{"folderRole":"book","id":"t3","title":"T","lineup":[]}', 1, 't'),
		('u1', 'not json', 1, 't'),
		('u2', '{"folderRole":"book","id":"u2","title":5,"lineup":[]}', 1, 't')`,
	`INSERT INTO entries (id, folder) VALUES ('x1', 'library-home'), ('x2', 'library-home'), ('x3', 'library-home'), ('d1', 'library-home'),
		('t3', 'library-home'), ('u1', 'library-home'), ('u2', 'library-home'), ('q1', 'library-home'), ('q2', 'library-home'), ('n1', 'library-home'),
		('y1', 'd1'), ('y2', 'd1'), ('y3', 'd1'), ('d2', 'd1'), ('y4', 'd1'), ('r1', 'y1'), ('r2', 'y1'),
		('t1', 'library-trash'), ('t2', 'library-trash'), ('d3', 'library-trash'), ('w1', 'd3'), ('w2', 'd3')`,
}

// 書庫ホームとフォルダの直下で名前が重なれば、並びの後ろに在る方を「名前 2」（在れば 3、4…）にして版を 1 上げ、変えた行を返す。
// ページとバインダの名前も数える。ゴミ箱の直下とブックの中は重なってよい。ゴミ箱の中のフォルダの直下は重ならない。名前を読めない行は数えず、変えない
func TestSameTitlesAreNumbered(t *testing.T) {
	path := filepath.Join(t.TempDir(), "data.db")
	beforeMigration(t, path, titlesMigration, sameTitles...)
	db, err := sql.Open("sqlite", path)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	before := map[string]map[string]string{"folders": rawRows(t, db, "folders"), "pages": rawRows(t, db, "pages")}
	tx, err := db.Begin()
	if err != nil {
		t.Fatal(err)
	}
	changed, err := numberSameTitles(tx)
	if err != nil {
		t.Fatal(err)
	}
	if err := tx.Commit(); err != nil {
		t.Fatal(err)
	}
	// d1 の中: 「B 2」が在るので y3 は「B 3」、d2 と同じ名前の y4 は「本 <&> 2」。d3 の中: w2。
	// 書庫ホームの中: 「A 2」のページ q1 が在るので x2・x3 は「A 3」「A 4」、t3 の後ろの q2 は「T 2」、バインダ n1 は「A 5」
	if want := []retitled{
		{"folders", "y3", "B", "B 3"}, {"folders", "y4", "本 <&>", "本 <&> 2"},
		{"folders", "w2", "W", "W 2"},
		{"folders", "x2", "A", "A 3"}, {"folders", "x3", "A", "A 4"}, {"pages", "q2", "T", "T 2"}, {"folders", "n1", "A", "A 5"},
	}; !slices.Equal(changed, want) {
		t.Fatalf("changed = %v; want %v", changed, want)
	}
	want := map[string]map[string]string{
		"folders": {
			"x2": `3 t {"title":"A 3","folderRole":"book","id":"x2","lineup":[]}`,
			"x3": `4 t {"title":"A 4","folderRole":"book","id":"x3","lineup":[]}`,
			"n1": `2 t {"folderRole":"binder","id":"n1","title":"A 5","pageType":"t","lineup":[]}`,
			"y3": `2 t {"folderRole":"book","id":"y3","title":"B 3","lineup":[]}`,
			"y4": `2 t {"folderRole":"book","id":"y4","title":"本 <&> 2","lineup":[],"locked":true}`,
			"w2": `2 t {"folderRole":"book","id":"w2","title":"W 2","lineup":[]}`,
		},
		"pages": {"q2": `4 t {"kind":"page","title":"T 2","id":"q2"}`},
	}
	for table, was := range before {
		rows := rawRows(t, db, table)
		if len(rows) != len(was) {
			t.Fatalf("%s has %d rows; want %d", table, len(rows), len(was))
		}
		for id, row := range rows {
			w, renamed := want[table][id]
			if !renamed {
				w = was[id]
			}
			if row != w {
				t.Fatalf("%s %s = %s; want %s", table, id, row, w)
			}
		}
	}
	// もう重なっていないので、もう一度行っても何も変えない
	tx, err = db.Begin()
	if err != nil {
		t.Fatal(err)
	}
	defer tx.Rollback()
	if again, err := numberSameTitles(tx); err != nil || len(again) != 0 {
		t.Fatalf("again = %v, %v", again, err)
	}
}

// 置き場所を開くと、重なる名前に番号が付く
func TestOpeningNumbersSameTitles(t *testing.T) {
	path := filepath.Join(t.TempDir(), "data.db")
	beforeMigration(t, path, titlesMigration,
		`UPDATE folders SET body = '{"folderRole":"home","id":"library-home","lineup":[{"kind":"book","id":"x1"},{"kind":"book","id":"x2"}]}' WHERE id = 'library-home'`,
		`INSERT INTO folders (id, body, version, updated_at) VALUES
			('x1', '{"folderRole":"book","id":"x1","title":"A","lineup":[]}', 1, 't'),
			('x2', '{"folderRole":"book","id":"x2","title":"A","lineup":[]}', 1, 't')`,
		`INSERT INTO entries (id, folder) VALUES ('x1', 'library-home'), ('x2', 'library-home')`,
	)
	s := open(t, path)
	if got, want := folderBody(t, s, "x2"), `{"folderRole":"book","id":"x2","title":"A 2","lineup":[]}`; got != want {
		t.Fatalf("x2 = %s; want %s", got, want)
	}
	if got, want := folderBody(t, s, "x1"), `{"folderRole":"book","id":"x1","title":"A","lineup":[]}`; got != want {
		t.Fatalf("x1 = %s; want %s", got, want)
	}
}
