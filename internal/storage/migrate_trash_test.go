package storage

import (
	"maps"
	"path/filepath"
	"testing"
)

// trashMigration は、ゴミ箱をフォルダの役にする足し方の番号
const trashMigration = 26

// openBeforeTrash は、ゴミ箱をフォルダの役にする前の形の置き場所に qs を行ってから開き、フォルダとページの表の全部（id → 「版 updated_at 本文」）と、表 entries を返す
func openBeforeTrash(t *testing.T, qs ...string) (folders, pages map[string]string, entries map[string]string, s Storage) {
	t.Helper()
	path := filepath.Join(t.TempDir(), "data.db")
	beforeMigration(t, path, trashMigration, qs...)
	s = open(t, path)
	db := s.(*sqliteStorage).db
	entries, err := s.Entries()
	if err != nil {
		t.Fatal(err)
	}
	return rawRows(t, db, "folders"), rawRows(t, db, "pages"), entries, s
}

// ゴミ箱に入れた時刻 trashed を持つブックは、入っていたフォルダの並びから外れ、ゴミ箱の並びに入れた時刻の古い順で入る（from は書庫ホームまでの道筋）。
// ブックの行は trashed だけを外し、ほかのキーの順と値・版・書いた時刻を変えない。並びを変えたフォルダは版を 1 上げ、書いた時刻は変えない
func TestTrashedBooksMoveIntoTheTrash(t *testing.T) {
	folders, _, entries, s := openBeforeTrash(t,
		`UPDATE folders SET version = 3, updated_at = 't-home',
			body = '{"folderRole":"home","id":"library-home","lineup":[{"kind":"folder","id":"d1"},{"kind":"book","id":"b1"},{"kind":"book","id":"b2"}]}'
			WHERE id = 'library-home'`,
		`INSERT INTO folders (id, body, version, updated_at) VALUES
			('d1', '{"title":"D","folderRole":"folder","id":"d1","lineup":[{"kind":"book","id":"b3"},{"kind":"book","id":"b4"}]}', 2, 't-d1'),
			('b1', '{"folderRole":"book","id":"b1","title":"B1","lineup":[]}', 1, 't-b1'),
			('b2', '{"title":"B2","trashed":"2026-11-02T00:00:00.000Z","folderRole":"book","id":"b2","lineup":[]}', 4, 't-b2'),
			('b3', '{"title":"本 <&>","folderRole":"book","id":"b3","trashed":"2026-11-01T00:00:00.000Z","lineup":[{"kind":"page","id":"p1"}]}', 5, 't-b3'),
			('b4', '{"folderRole":"book","id":"b4","title":"B4","lineup":[]}', 1, 't-b4')`,
		`INSERT INTO pages (id, body, version, updated_at) VALUES ('p1', '{"kind":"page","id":"p1"}', 1, 't-p1')`,
		`INSERT INTO entries (id, folder) VALUES ('d1', 'library-home'), ('b1', 'library-home'), ('b2', 'library-home'), ('b3', 'd1'), ('b4', 'd1'), ('p1', 'b3')`,
	)
	want := map[string]string{
		HomeID: `4 t-home {"folderRole":"home","id":"library-home","lineup":[{"kind":"folder","id":"d1"},{"kind":"book","id":"b1"}]}`,
		"d1":   `3 t-d1 {"title":"D","folderRole":"folder","id":"d1","lineup":[{"kind":"book","id":"b4"}]}`,
		"b1":   `1 t-b1 {"folderRole":"book","id":"b1","title":"B1","lineup":[]}`,
		"b2":   `4 t-b2 {"title":"B2","folderRole":"book","id":"b2","lineup":[]}`,
		"b3":   `5 t-b3 {"title":"本 <&>","folderRole":"book","id":"b3","lineup":[{"kind":"page","id":"p1"}]}`,
		"b4":   `1 t-b4 {"folderRole":"book","id":"b4","title":"B4","lineup":[]}`,
	}
	trash := folders[TrashID]
	delete(folders, TrashID)
	delete(folders, UnreadableID) // あとの移し替えが作る
	if !maps.Equal(folders, want) {
		t.Fatalf("folders = %v; want %v", folders, want)
	}
	if want := `{"folderRole":"trash","id":"library-trash","lineup":[` +
		`{"kind":"book","id":"b3","trashed":"2026-11-01T00:00:00.000Z","from":["d1","library-home"]},` +
		`{"kind":"book","id":"b2","trashed":"2026-11-02T00:00:00.000Z","from":["library-home"]}]}`; folderBody(t, s, TrashID) != want || trash[:2] != "1 " {
		t.Fatalf("trash = %s; want %s", trash, want)
	}
	if !maps.Equal(entries, map[string]string{"d1": HomeID, "b1": HomeID, "b2": TrashID, "b3": TrashID, "b4": "d1", "p1": "b3"}) {
		t.Fatalf("entries = %v", entries)
	}
	// ゴミ箱はブックでないので、触れた時刻を返さない
	if touched, err := s.Touched(); err != nil || !maps.Equal(touched, map[string]string{"b1": "t-b1", "b2": "t-b2", "b3": "t-p1", "b4": "t-b4"}) {
		t.Fatalf("touched = %v, %v", touched, err)
	}
}

// withField は、ほかのキーの順と値を変えずに、1 つのキーを替える・外す・足す
func TestWithFieldKeepsTheOrderOfKeys(t *testing.T) {
	body := []byte(`{"b":1,"a":{"z":[1, 2]},"c":"<&>"}`)
	for _, c := range []struct {
		key, value, want string
	}{
		{"a", `"x"`, `{"b":1,"a":"x","c":"<&>"}`},
		{"a", ``, `{"b":1,"c":"<&>"}`},
		{"d", `true`, `{"b":1,"a":{"z":[1, 2]},"c":"<&>","d":true}`},
	} {
		var value []byte
		if c.value != "" {
			value = []byte(c.value)
		}
		if got, ok := withField(body, c.key, value); !ok || string(got) != c.want {
			t.Fatalf("withField(%s) = %s, %v; want %s", c.key, got, ok, c.want)
		}
	}
	if _, ok := withField([]byte(`not json`), "a", nil); ok {
		t.Fatal("withField of an unreadable body succeeded")
	}
}
