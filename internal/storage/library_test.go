package storage

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"maps"
	"path/filepath"
	"testing"
)

// libraryMigration は、書庫ホームを作る足し方の番号
const libraryMigration = 25

// rawRows は、表 table の全部の行（id → 「版 updated_at 本文」）
func rawRows(t *testing.T, db *sql.DB, table string) map[string]string {
	t.Helper()
	rows, err := db.Query(`SELECT id, body, version, updated_at FROM ` + table)
	if err != nil {
		t.Fatal(err)
	}
	defer rows.Close()
	out := map[string]string{}
	for rows.Next() {
		var id, body, at string
		var version int64
		if err := rows.Scan(&id, &body, &version, &at); err != nil {
			t.Fatal(err)
		}
		out[id] = fmt.Sprintf("%d %s %s", version, at, body)
	}
	return out
}

// beforeLibrary は、書庫ホームを作る前の形の置き場所を path に作り、qs を行う
func beforeLibrary(t *testing.T, path string, qs ...string) {
	t.Helper()
	beforeMigration(t, path, libraryMigration, qs...)
}

// beforeMigration は、足し方 n を行う前の形の置き場所を path に作り、qs を行う
func beforeMigration(t *testing.T, path string, n int, qs ...string) {
	t.Helper()
	db, err := sql.Open("sqlite", path)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	for i, q := range migrations[:n] {
		tx, err := db.Begin()
		if err != nil {
			t.Fatal(err)
		}
		if _, err := tx.Exec(q); err != nil {
			t.Fatal(err)
		}
		if run := goMigrations[i]; run != nil {
			if err := run(tx); err != nil {
				t.Fatal(err)
			}
		}
		if err := tx.Commit(); err != nil {
			t.Fatal(err)
		}
	}
	for _, q := range append([]string{fmt.Sprintf(`PRAGMA user_version = %d`, n)}, qs...) {
		if _, err := db.Exec(q); err != nil {
			t.Fatal(err)
		}
	}
}

// 空の置き場所を開くと、書庫ホームとゴミ箱だけが出来る（フォルダ「旧ブック」は作らない）
func TestEmptyStorageGetsOnlyTheLibraryHomeAndTheTrash(t *testing.T) {
	s := open(t, filepath.Join(t.TempDir(), "data.db"))
	folders, err := s.Folders()
	if err != nil || len(folders) != 2 || folders[0].ID != HomeID || folders[0].Version != 1 ||
		string(folders[0].Body) != `{"folderRole":"home","id":"library-home","lineup":[]}` ||
		folders[1].ID != TrashID || folders[1].Version != 1 || string(folders[1].Body) != `{"folderRole":"trash","id":"library-trash","lineup":[]}` {
		t.Fatalf("folders = %+v, %v", folders, err)
	}
	if entries, err := s.Entries(); err != nil || len(entries) != 0 {
		t.Fatalf("entries = %v, %v", entries, err)
	}
	if touched, err := s.Touched(); err != nil || len(touched) != 0 {
		t.Fatalf("touched = %v, %v", touched, err)
	}
}

// どのフォルダにも入っていないフォルダ（ブック。読めない物も）は、書庫ホームの中のフォルダ「旧ブック」に id の順で入る。
// ブック・バインダ・ページの行は、本文も版も書いた時刻も変わらない
func TestBooksMoveIntoTheOldBooksFolder(t *testing.T) {
	path := filepath.Join(t.TempDir(), "data.db")
	beforeLibrary(t, path,
		`INSERT INTO folders (id, body, version, updated_at) VALUES
			('b2', '{"folderRole":"book","id":"b2","lineup":[{"kind":"page","id":"p1"},{"kind":"binder","id":"f1"}]}', 4, 't-b2'),
			('f1', '{"folderRole":"binder","id":"f1","pageType":"x:slide","lineup":[{"kind":"page","id":"p2"}]}', 2, 't-f1'),
			('a1', '{"folderRole":"book","id":"a1"}', 7, 't-a1'),
			('c-broken', 'not json', 3, 't-c')`,
		`INSERT INTO pages (id, body, version, updated_at) VALUES
			('p1', '{"kind":"page","id":"p1",  "x":1}', 5, 't-p1'),
			('p2', '{"kind":"page","id":"p2"}', 1, 't-p2')`,
		`INSERT INTO entries (id, folder) VALUES ('p1', 'b2'), ('f1', 'b2'), ('p2', 'f1')`,
	)
	db, err := sql.Open("sqlite", path)
	if err != nil {
		t.Fatal(err)
	}
	beforeFolders, beforePages := rawRows(t, db, "folders"), rawRows(t, db, "pages")
	db.Close()

	s := open(t, path)
	sdb := s.(*sqliteStorage).db
	afterFolders := rawRows(t, sdb, "folders")
	if !maps.Equal(rawRows(t, sdb, "pages"), beforePages) {
		t.Fatalf("pages changed: %v", rawRows(t, sdb, "pages"))
	}
	for id, was := range beforeFolders {
		if afterFolders[id] != was {
			t.Fatalf("folder %s = %q; want it unchanged %q", id, afterFolders[id], was)
		}
	}
	entries, err := s.Entries()
	if err != nil {
		t.Fatal(err)
	}
	old := entries["a1"]
	if old == "" || len(afterFolders) != len(beforeFolders)+3 || !maps.Equal(entries, map[string]string{
		"p1": "b2", "f1": "b2", "p2": "f1", "a1": old, "b2": old, "c-broken": old, old: HomeID,
	}) {
		t.Fatalf("folders %v, entries %v", afterFolders, entries)
	}
	folders, err := s.Folders()
	if err != nil {
		t.Fatal(err)
	}
	bodies := map[string]string{}
	for _, f := range folders {
		bodies[f.ID] = string(f.Body)
	}
	if want := `{"folderRole":"home","id":"library-home","lineup":[{"id":"` + old + `","kind":"folder"}]}`; bodies[HomeID] != want {
		t.Fatalf("home = %s; want %s", bodies[HomeID], want)
	}
	var folder struct {
		FolderRole string            `json:"folderRole"`
		ID         string            `json:"id"`
		Title      string            `json:"title"`
		Lineup     []json.RawMessage `json:"lineup"`
	}
	if err := json.Unmarshal([]byte(bodies[old]), &folder); err != nil || folder.FolderRole != "folder" || folder.ID != old || folder.Title != "旧ブック" ||
		fmt.Sprint(rawStrings(folder.Lineup)) != `[{"id":"a1","kind":"book"} {"id":"b2","kind":"book"} {"id":"c-broken","kind":"book"}]` {
		t.Fatalf("the old books folder = %s, %v", bodies[old], err)
	}
	// ブックの書いた時刻は、入っているフォルダに数えず、ブックのまま
	if touched, err := s.Touched(); err != nil || !maps.Equal(touched, map[string]string{"a1": "t-a1", "b2": "t-p2", "c-broken": "t-c"}) {
		t.Fatalf("touched = %v, %v", touched, err)
	}
}

func rawStrings(list []json.RawMessage) []string {
	out := make([]string, len(list))
	for i, e := range list {
		out[i] = string(e)
	}
	return out
}

// ブックの触れた時刻は、書庫ホームやフォルダの下に入っていても、入っていないときと同じ。書庫ホームとフォルダの時刻は返さない
func TestTouchedOfBooksInFolders(t *testing.T) {
	put := func(s Storage, placed bool) {
		t.Helper()
		batch := Batch{
			Pages: []RowWrite{row("p1", 0, `{"id":"p1"}`), row("p2", 0, `{"id":"p2"}`)},
			Folders: []RowWrite{row("b1", 0, `{"folderRole":"book","id":"b1"}`), row("f1", 0, `{"folderRole":"binder","id":"f1"}`),
				row("b2", 0, `not json`)},
			Entries: []EntryPut{{"p1", "b1"}, {"f1", "b1"}, {"p2", "f1"}},
		}
		if placed {
			batch.Folders = append(batch.Folders, row("d1", 0, `{"folderRole":"folder","id":"d1","lineup":[{"kind":"book","id":"b1"}]}`),
				RowWrite{ID: HomeID, Base: 1, Body: HomeBody([]json.RawMessage{RefOf("folder", "d1"), RefOf("book", "b2")})})
			batch.Entries = append(batch.Entries, EntryPut{"b1", "d1"}, EntryPut{"d1", HomeID}, EntryPut{"b2", HomeID})
		}
		if err := s.Apply(batch); err != nil {
			t.Fatal(err)
		}
		if err := s.Open("b2", "x-b2"); err != nil {
			t.Fatal(err)
		}
		if err := s.Open("gone", "x-gone"); err != nil {
			t.Fatal(err)
		}
	}
	// 書いた時刻を揃えるため、どちらの置き場所の行も同じ時刻に書き直す
	same := func(s Storage) map[string]string {
		t.Helper()
		db := s.(*sqliteStorage).db
		for _, q := range []string{`UPDATE folders SET updated_at = 't-' || id`, `UPDATE pages SET updated_at = 't-' || id`} {
			if _, err := db.Exec(q); err != nil {
				t.Fatal(err)
			}
		}
		got, err := s.Touched()
		if err != nil {
			t.Fatal(err)
		}
		return got
	}
	flat := open(t, filepath.Join(t.TempDir(), "flat.db"))
	put(flat, false)
	placed := open(t, filepath.Join(t.TempDir(), "placed.db"))
	put(placed, true)
	want := map[string]string{"b1": "t-p2", "b2": "x-b2", "gone": "x-gone"}
	if got := same(flat); !maps.Equal(got, want) {
		t.Fatalf("touched without folders = %v; want %v", got, want)
	}
	if got := same(placed); !maps.Equal(got, want) {
		t.Fatalf("touched in folders = %v; want %v", got, want)
	}
}
