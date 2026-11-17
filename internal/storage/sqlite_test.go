package storage

import (
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"maps"
	"path/filepath"
	"testing"
	"time"
)

func open(t *testing.T, path string) Storage {
	t.Helper()
	s, err := OpenSQLite(path)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { s.Close() })
	return s
}

// ページかフォルダ 1 つの書き込み
func row(id string, base int64, body string) RowWrite {
	return RowWrite{ID: id, Body: json.RawMessage(body), Base: base}
}

// 置いてあるページとフォルダ（どちらも id → 「版 本文」）。フォルダは、書庫ホームと、その下のフォルダ（役 folder）を除く（library_test.go が確かめる）
func stored(t *testing.T, s Storage) (pages, folders map[string]string) {
	t.Helper()
	ps, err := s.Pages()
	if err != nil {
		t.Fatal(err)
	}
	fs, err := s.Folders()
	if err != nil {
		t.Fatal(err)
	}
	pages, folders = map[string]string{}, map[string]string{}
	for _, p := range ps {
		pages[p.ID] = fmt.Sprintf("%d %s", p.Version, p.Body)
	}
	for _, f := range fs {
		if !IsBookRole(RoleOf(f.Body)) && RoleOf(f.Body) != "binder" {
			continue
		}
		folders[f.ID] = fmt.Sprintf("%d %s", f.Version, f.Body)
	}
	return pages, folders
}

// ページもフォルダも、書くときに版を確かめる: 作るのは Base 0 でまだ無いときだけ、置いてある版と違えば ErrConflict、消すときも版を確かめる。書くたびに版が 1 上がる
func TestRowWritesCheckTheVersion(t *testing.T) {
	for _, table := range []string{"pages", "folders"} {
		t.Run(table, func(t *testing.T) {
			s := open(t, filepath.Join(t.TempDir(), "data.db"))
			write := func(w RowWrite) error {
				if table == "pages" {
					return s.Apply(Batch{Pages: []RowWrite{w}})
				}
				return s.Apply(Batch{Folders: []RowWrite{w}})
			}
			read := func() map[string]string {
				pages, folders := stored(t, s)
				if table == "pages" {
					return pages
				}
				return folders
			}
			if err := write(row("r1", 0, `{"id":"r1"}`)); err != nil || read()["r1"] != `1 {"id":"r1"}` {
				t.Fatalf("first write = %v, %v", err, read())
			}
			if err := write(row("r1", 0, `{"id":"r1","x":1}`)); !errors.Is(err, ErrConflict) {
				t.Fatalf("adding an existing row = %v; want ErrConflict", err)
			}
			if err := write(row("r1", 1, `{"id":"r1","x":2}`)); err != nil || read()["r1"] != `2 {"id":"r1","x":2}` {
				t.Fatalf("write on version 1 = %v, %v", err, read())
			}
			if err := write(row("r1", 1, `{"id":"r1","x":3}`)); !errors.Is(err, ErrConflict) {
				t.Fatalf("stale write = %v; want ErrConflict", err)
			}
			if err := write(row("r9", 3, `{}`)); !errors.Is(err, ErrConflict) {
				t.Fatalf("updating a missing row = %v; want ErrConflict", err)
			}
			if err := write(RowWrite{ID: "r1", Base: 1, Removed: true}); !errors.Is(err, ErrConflict) {
				t.Fatalf("stale removal = %v; want ErrConflict", err)
			}
			if got := read(); len(got) != 1 || got["r1"] != `2 {"id":"r1","x":2}` {
				t.Fatalf("after the refused writes = %v", got)
			}
			if err := write(RowWrite{ID: "r1", Base: 2, Removed: true}); err != nil || len(read()) != 0 {
				t.Fatalf("removal on version 2 = %v, %v", err, read())
			}
			if err := write(row("r1", 0, `{"id":"r1"}`)); err != nil || read()["r1"] != `1 {"id":"r1"}` {
				t.Fatalf("adding again after the removal = %v, %v", err, read())
			}
		})
	}
}

func TestSettingsPerUser(t *testing.T) {
	s := open(t, filepath.Join(t.TempDir(), "data.db"))
	if b, err := s.Settings("me"); b != nil || err != nil {
		t.Fatalf("settings before put = %s, %v", b, err)
	}
	for _, body := range []string{`{"lang":"en"}`, `{"lang":"ja"}`} {
		if err := s.PutSettings("me", json.RawMessage(body)); err != nil {
			t.Fatal(err)
		}
	}
	if b, _ := s.Settings("me"); string(b) != `{"lang":"ja"}` {
		t.Fatalf("settings = %s", b)
	}
	if b, _ := s.Settings("other"); b != nil {
		t.Fatalf("other user's settings = %s", b)
	}
}

func TestReopenKeepsDataAndRefusesNewerForm(t *testing.T) {
	batch := Batch{
		Pages:   []RowWrite{row("p1", 0, `{"id":"p1"}`)},
		Folders: []RowWrite{row("b1", 0, `{"id":"b1"}`)},
		Entries: []EntryPut{{"p1", "b1"}},
	}
	path := filepath.Join(t.TempDir(), "data.db")
	s, err := OpenSQLite(path)
	if err != nil {
		t.Fatal(err)
	}
	if err := s.Apply(batch); err != nil {
		t.Fatal(err)
	}
	s.(*sqliteStorage).db.Exec(`PRAGMA user_version = 99`)
	s.Close()
	if _, err := OpenSQLite(path); err == nil {
		t.Fatal("opening data of a newer form succeeded")
	}
	path2 := filepath.Join(t.TempDir(), "data.db")
	a := open(t, path2)
	if err := a.Apply(batch); err != nil {
		t.Fatal(err)
	}
	a.Close()
	b := open(t, path2)
	pages, folders := stored(t, b)
	entries, _ := b.Entries()
	if len(pages) != 1 || len(folders) != 1 || len(entries) != 1 || entries["p1"] != "b1" {
		t.Fatalf("after reopen: pages %v, folders %v, entries %v", pages, folders, entries)
	}
}

// ブックのフォルダの時刻は、フォルダを書いた時刻・その中のページとバインダを書いた時刻・バインダの中のページを書いた時刻・開いた時刻の、いちばん新しい物。
// ほかのブックの時刻は動かない
func TestTouchedIsTheNewestOfOpenedAndWrittenBelow(t *testing.T) {
	s := open(t, filepath.Join(t.TempDir(), "data.db"))
	if err := s.Apply(Batch{
		Pages:   []RowWrite{row("p1", 0, `{"id":"p1"}`), row("p2", 0, `{"id":"p2"}`)},
		Folders: []RowWrite{row("b1", 0, `{"id":"b1"}`), row("f1", 0, `{"folderRole":"binder","id":"f1"}`), row("b2", 0, `{"id":"b2"}`)},
		Entries: []EntryPut{{"p1", "b1"}, {"f1", "b1"}, {"p2", "f1"}},
	}); err != nil {
		t.Fatal(err)
	}
	got, err := s.Touched()
	if err != nil || got["b1"] == "" || got["b2"] == "" {
		t.Fatalf("touched after writing = %v, %v", got, err)
	}
	// バインダは、入っているブックの時刻に数える（それ自身の時刻は返さない）
	if _, binder := got["f1"]; binder {
		t.Fatalf("touched = %v; want no time for the binder f1", got)
	}
	last, other := got["b1"], got["b2"]
	for _, step := range []struct {
		name  string
		batch Batch
	}{
		{"a page in the book", Batch{Pages: []RowWrite{row("p1", 1, `{"id":"p1","x":1}`)}}},
		{"a page in the binder", Batch{Pages: []RowWrite{row("p2", 1, `{"id":"p2","x":1}`)}}},
		{"the binder", Batch{Folders: []RowWrite{row("f1", 1, `{"folderRole":"binder","id":"f1","x":1}`)}}},
		{"the book's folder", Batch{Folders: []RowWrite{row("b1", 1, `{"id":"b1","x":1}`)}}},
	} {
		time.Sleep(2 * time.Millisecond)
		if err := s.Apply(step.batch); err != nil {
			t.Fatal(err)
		}
		if got, _ = s.Touched(); got["b1"] <= last || got["b2"] != other {
			t.Fatalf("touched after writing %s = %v; want b1 newer than %s and b2 still %s", step.name, got, last, other)
		}
		last = got["b1"]
	}
	// 開いた時刻は、置き場所に無い id にも残る。書いた時刻より新しければ、そちら
	if err := s.Open("unsaved", "2030-01-01T00:00:00Z"); err != nil {
		t.Fatal(err)
	}
	if err := s.Open("b1", "2030-01-02T00:00:00Z"); err != nil {
		t.Fatal(err)
	}
	if got, _ = s.Touched(); got["unsaved"] != "2030-01-01T00:00:00Z" || got["b1"] != "2030-01-02T00:00:00Z" {
		t.Fatalf("touched after opening = %v", got)
	}
	// 書いた時刻の方が新しければ、書いた時刻
	if err := s.Open("b1", "2000-01-01T00:00:00Z"); err != nil {
		t.Fatal(err)
	}
	if got, _ = s.Touched(); got["b1"] != last {
		t.Fatalf("touched = %v; want the written time %s", got, last)
	}
}

// 消したブック（RemovedBooks）は、開いた時刻が消える。ほかのブックの物は残る
func TestRemovedBooksLoseOpened(t *testing.T) {
	s := open(t, filepath.Join(t.TempDir(), "data.db"))
	for _, id := range []string{"b1", "b2"} {
		if err := s.Apply(Batch{
			Folders: []RowWrite{row(id, 0, `{"id":"`+id+`"}`)},
		}); err != nil {
			t.Fatal(err)
		}
		if err := s.Open(id, "2030-01-01T00:00:00.000Z"); err != nil {
			t.Fatal(err)
		}
	}
	if err := s.Apply(Batch{Folders: []RowWrite{{ID: "b2", Base: 1, Removed: true}}, RemovedBooks: []string{"b2"}}); err != nil {
		t.Fatal(err)
	}
	if _, folders := stored(t, s); len(folders) != 1 || folders["b1"] == "" {
		t.Fatalf("folders = %v", folders)
	}
	if touched, _ := s.Touched(); len(touched) != 1 || touched["b1"] != "2030-01-01T00:00:00.000Z" {
		t.Fatalf("touched = %v; want only b1 at its opened time", touched)
	}
}

// エントリの入っているフォルダは、エントリ 1 つにつき 1 つ: 同じエントリを 2 つのフォルダに入れる書き込みは失敗して何も書かない。
// 入っているフォルダを替える書き込みは通り、Folder が空なら表から消える
func TestEntriesHoldOneFolderPerEntry(t *testing.T) {
	s := open(t, filepath.Join(t.TempDir(), "data.db"))
	if err := s.Apply(Batch{Entries: []EntryPut{{"p1", "a"}}}); err != nil {
		t.Fatal(err)
	}
	if err := s.Apply(Batch{
		Pages:   []RowWrite{row("p2", 0, `{"id":"p2"}`)},
		Entries: []EntryPut{{"p1", "b"}, {"p2", "a"}, {"p2", "b"}},
	}); err == nil {
		t.Fatal("putting one entry into two folders succeeded")
	}
	pages, _ := stored(t, s)
	if entries, _ := s.Entries(); len(pages) != 0 || len(entries) != 1 || entries["p1"] != "a" {
		t.Fatalf("something was written: pages %v, entries %v", pages, entries)
	}
	if err := s.Apply(Batch{Entries: []EntryPut{{"p1", "b"}, {"p2", "a"}}}); err != nil {
		t.Fatal(err)
	}
	if entries, _ := s.Entries(); len(entries) != 2 || entries["p1"] != "b" || entries["p2"] != "a" {
		t.Fatalf("entries after moving = %v", entries)
	}
	if err := s.Apply(Batch{Entries: []EntryPut{{"p1", ""}}}); err != nil {
		t.Fatal(err)
	}
	if entries, _ := s.Entries(); len(entries) != 1 || entries["p2"] != "a" {
		t.Fatalf("entries after taking one out = %v", entries)
	}
}

// アノテーションはページごとに持つ。空の並びを書くと消える
func TestAnnotationsPerPage(t *testing.T) {
	s := open(t, filepath.Join(t.TempDir(), "data.db"))
	for _, page := range []string{"p1", "p2"} {
		if err := s.PutAnnotations(page, json.RawMessage(`[{"id":"c"}]`)); err != nil {
			t.Fatal(err)
		}
	}
	if all, _ := s.Annotations(); len(all) != 2 || string(all["p1"]) != `[{"id":"c"}]` {
		t.Fatalf("annotations = %v", all)
	}
	if err := s.PutAnnotations("p1", json.RawMessage(`[]`)); err != nil {
		t.Fatal(err)
	}
	if all, _ := s.Annotations(); len(all) != 1 || string(all["p2"]) != `[{"id":"c"}]` {
		t.Fatalf("annotations after clearing = %v", all)
	}
}

// ゴミ箱に入れた時刻の列（trashed_at）を持っていた置き場所は、時刻をブックのデータの trashed に移す
func TestTrashedAtMovesIntoTheBook(t *testing.T) {
	path := filepath.Join(t.TempDir(), "data.db")
	db, err := sql.Open("sqlite", path)
	if err != nil {
		t.Fatal(err)
	}
	for _, q := range append(migrations[:3:3],
		`PRAGMA user_version = 3`,
		`INSERT INTO books (id, body, version, updated_at, trashed_at) VALUES ('b1', '{"id":"b1"}', 1, 'x', '2026-10-29T01:00:00.000Z'), ('b2', '{"id":"b2"}', 1, 'x', NULL)`,
	) {
		if _, err := db.Exec(q); err != nil {
			t.Fatal(err)
		}
	}
	db.Close()
	s := open(t, path)
	_, books := stored(t, s)
	if len(books) != 2 || books["b1"] != `1 {"folderRole":"book","id":"b1","trashed":"2026-10-29T01:00:00.000Z"}` || books["b2"] != `1 {"folderRole":"book","id":"b2"}` {
		t.Fatalf("books' folders = %v", books)
	}
}

// 1 冊だけのタイプのブック（id は master）が残っていた置き場所は、その行を消し、ほかのブックは残す
func TestMasterBookIsRemoved(t *testing.T) {
	path := filepath.Join(t.TempDir(), "data.db")
	db, err := sql.Open("sqlite", path)
	if err != nil {
		t.Fatal(err)
	}
	before := migrations[:9:9] // 次の足し方の前まで
	for _, q := range append(before,
		fmt.Sprintf(`PRAGMA user_version = %d`, len(before)),
		`INSERT INTO books (id, body, version, updated_at) VALUES ('master', '{"id":"master"}', 1, 'x'), ('b1', '{"id":"b1"}', 1, 'x')`,
		`INSERT INTO opened (id, at) VALUES ('master', 'x'), ('b1', 'x')`,
		`INSERT INTO annotations (book, body, updated_at) VALUES ('master', '[]', 'x')`,
		`INSERT INTO ai_edit_tickets (book, body, updated_at) VALUES ('master', '[]', 'x')`,
	) {
		if _, err := db.Exec(q); err != nil {
			t.Fatal(err)
		}
	}
	db.Close()
	s := open(t, path)
	if _, books := stored(t, s); len(books) != 1 || books["b1"] != `1 {"folderRole":"book","id":"b1"}` {
		t.Fatalf("books' folders = %v", books)
	}
	if got, _ := s.Touched(); len(got) != 1 || got["b1"] == "" {
		t.Fatalf("touched = %v", got)
	}
	if all, _ := s.Annotations(); len(all) != 0 {
		t.Fatalf("annotations = %v", all)
	}
}

// プロジェクトの項目は外す: ブックと郵便の project、参加者の projects、参加の要求の郵便の props の projects（ほかの項目と、無かった物は変えない）
func TestProjectFieldsAreRemoved(t *testing.T) {
	path := filepath.Join(t.TempDir(), "data.db")
	db, err := sql.Open("sqlite", path)
	if err != nil {
		t.Fatal(err)
	}
	before := migrations[:12:12] // 次の足し方の前まで
	for _, q := range append(before,
		fmt.Sprintf(`PRAGMA user_version = %d`, len(before)),
		`INSERT INTO books (id, body, version, updated_at) VALUES ('b1', '{"id":"b1","title":"x","project":"default"}', 1, 'x'), ('b2', '{"id":"b2"}', 1, 'x')`,
		`INSERT INTO mailbox (user, body, updated_at) VALUES ('me', '[{"id":"m1","mail":"@matomezu/base:join-request","project":"default","props":{"projects":["default"],"a":1}},{"id":"m2","mail":"@x/other","project":"default","props":{"projects":["keep"]}}]', 'x'), ('u2', '[]', 'x')`,
	) {
		if _, err := db.Exec(q); err != nil {
			t.Fatal(err)
		}
	}
	db.Close()
	s := open(t, path)
	_, books := stored(t, s)
	if len(books) != 2 || books["b1"] != `1 {"folderRole":"book","id":"b1","title":"x"}` || books["b2"] != `1 {"folderRole":"book","id":"b2"}` {
		t.Fatalf("books' folders = %v", books)
	}
	mails := recordsOfKind(t, s, mailSubject)
	if len(mails) != 2 || mails["m1"] != `{"id":"m1","mail":"@matomezu/base:join-request","props":{"a":1},"order":1}` || mails["m2"] != `{"id":"m2","mail":"@x/other","props":{"projects":["keep"]},"order":2}` {
		t.Fatalf("mail = %v", mails)
	}
}

// 1 つのまとまり（Apply）は、全部書くか、何も書かないか。後ろに並べた物の版が 1 つでも違えば、前に並べたページ・フォルダ・エントリ・設定・アノテーションも書かない（ErrConflict）
func TestApplyWritesAllOrNothingOnAConflict(t *testing.T) {
	s := open(t, filepath.Join(t.TempDir(), "data.db"))
	if err := s.Apply(Batch{Pages: []RowWrite{row("p2", 0, `{"id":"p2"}`)}, Folders: []RowWrite{row("b2", 0, `{"id":"b2"}`)}}); err != nil {
		t.Fatal(err)
	}
	whole := Batch{
		Pages:         []RowWrite{row("p1", 0, `{"id":"p1"}`), row("p2", 1, `{"id":"p2","x":1}`)},
		Folders:       []RowWrite{row("b1", 0, `{"id":"b1"}`)},
		Entries:       []EntryPut{{"p1", "b1"}},
		Settings:      &UserBody{"me", json.RawMessage(`{"a":1}`)},
		Annotations:   []PageBody{{"p1", json.RawMessage(`[{"id":"n1"}]`)}},
		AIEditTickets: json.RawMessage(`[{"at":"t"}]`),
	}
	stale := map[string]Batch{
		"record": whole,
		"folder": {Pages: whole.Pages, Folders: []RowWrite{row("b1", 0, `{"id":"b1"}`), row("b2", 7, `{"id":"b2","x":1}`)}},
		"page":   {Pages: []RowWrite{row("p1", 0, `{"id":"p1"}`), row("p2", 7, `{"id":"p2","x":1}`)}},
	}
	record := stale["record"]
	record.Records = []RecordWrite{{Subject: "x:card", ID: "c1", Body: json.RawMessage(`{"id":"c1"}`), Base: 7}}
	stale["record"] = record
	for name, batch := range stale {
		if err := s.Apply(batch); !errors.Is(err, ErrConflict) {
			t.Fatalf("apply with a stale %s = %v; want ErrConflict", name, err)
		}
		pages, folders := stored(t, s)
		entries, _ := s.Entries()
		settings, _ := s.Settings("me")
		notes, _ := s.Annotations()
		tickets, _ := s.AIEditTickets()
		if len(pages) != 1 || pages["p2"] != `1 {"id":"p2"}` || len(folders) != 1 || folders["b2"] != `1 {"id":"b2"}` ||
			len(entries) != 0 || settings != nil || len(notes) != 0 || len(tickets) != 0 {
			t.Fatalf("a stale %s left something written: pages %v, folders %v, entries %v, settings %s, annotations %v, tickets %v",
				name, pages, folders, entries, settings, notes, tickets)
		}
	}
	// 版が合えば、同じまとまりが書ける
	if err := s.Apply(whole); err != nil {
		t.Fatal(err)
	}
	if pages, _ := stored(t, s); pages["p1"] != `1 {"id":"p1"}` || pages["p2"] != `2 {"id":"p2","x":1}` {
		t.Fatalf("pages = %v", pages)
	}
}

// SQL の失敗（ここではレコードの書き込みが断られる）の途中でも、前に書いた物は巻き戻る。1 つのまとまりは、書く順にページ → フォルダ → エントリ → … → 設定 → … → レコード
func TestApplyRollsBackWhenALaterWriteFails(t *testing.T) {
	path := filepath.Join(t.TempDir(), "data.db")
	s := open(t, path)
	db, err := sql.Open("sqlite", path)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	if _, err := db.Exec(`CREATE TRIGGER refuse_records BEFORE INSERT ON records BEGIN SELECT RAISE(ABORT, 'refused'); END`); err != nil {
		t.Fatal(err)
	}
	batch := Batch{
		Pages:    []RowWrite{row("p1", 0, `{"id":"p1"}`)},
		Folders:  []RowWrite{row("b1", 0, `{"id":"b1"}`)},
		Entries:  []EntryPut{{"p1", "b1"}},
		Settings: &UserBody{"me", json.RawMessage(`{"a":1}`)},
		Records:  []RecordWrite{{Subject: mailSubject, ID: "m1", Body: json.RawMessage(`{"id":"m1"}`)}},
	}
	if err := s.Apply(batch); err == nil {
		t.Fatal("apply with a refused write succeeded")
	}
	pages, folders := stored(t, s)
	entries, _ := s.Entries()
	settings, _ := s.Settings("me")
	if len(pages) != 0 || len(folders) != 0 || len(entries) != 0 || settings != nil {
		t.Fatalf("not rolled back: pages %v, folders %v, entries %v, settings %s", pages, folders, entries, settings)
	}
	// 書けるようになれば、同じまとまりが書ける
	if _, err := db.Exec(`DROP TRIGGER refuse_records`); err != nil {
		t.Fatal(err)
	}
	if err := s.Apply(batch); err != nil {
		t.Fatal(err)
	}
}

// 20 字より長いワークルームの名前は 20 字に切り詰め、短い名前と、名前の無い参加者・郵便、参加の頼み以外の郵便は変えない
func TestLongWorkroomNamesAreShortened(t *testing.T) {
	path := filepath.Join(t.TempDir(), "data.db")
	db, err := sql.Open("sqlite", path)
	if err != nil {
		t.Fatal(err)
	}
	before := migrations[:11:11] // 次の足し方の前まで
	for _, q := range append(before,
		fmt.Sprintf(`PRAGMA user_version = %d`, len(before)),
		`INSERT INTO participants (user, body, updated_at) VALUES ('u1', '[{"id":"p1","state":"joined","workroom":"あいうえおかきくけこさしすせそたちつてとなにぬ","bird":"inko","ai":"a","model":"m","env":"e","sessionName":"","link":"l1","requestedAt":"t"},{"id":"p2","state":"joined","workroom":"短い","bird":"suzume","ai":"a","model":"m","env":"e","sessionName":"","link":"l2","requestedAt":"t"}]', 'x'), ('u2', '[]', 'x')`,
		`INSERT INTO mailbox (user, body, updated_at) VALUES ('me', '[{"id":"m1","mail":"@matomezu/base:join-request","props":{"workroom":"abcdefghij klmnopqrstuvwxyz"}},{"id":"m3","mail":"@x/other","props":{"workroom":"abcdefghij klmnopqrstuvwxyz"}},{"id":"m2","props":{"a":1}}]', 'x')`,
	) {
		if _, err := db.Exec(q); err != nil {
			t.Fatal(err)
		}
	}
	db.Close()
	s := open(t, path)
	rooms := roomNames(t, s)
	if rooms["p1"] != "あいうえおかきくけこさしすせそたちつてと" || rooms["p2"] != "短い" {
		t.Fatalf("workroom names = %v", rooms)
	}
	mails := recordsOfKind(t, s, mailSubject)
	if mails["m1"] != `{"id":"m1","mail":"@matomezu/base:join-request","props":{"workroom":"abcdefghij klmnopqrs"},"order":1}` || mails["m3"] != `{"id":"m3","mail":"@x/other","props":{"workroom":"abcdefghij klmnopqrstuvwxyz"},"order":2}` || mails["m2"] != `{"id":"m2","props":{"a":1},"order":3}` {
		t.Fatalf("mail = %v", mails)
	}
}

// レコードは種類・id ごとに 1 件、版つきで書き、番号の表と同じ 1 回の書き込みで進める。版が違えば何も書かず、開き直しても残る
func TestRecordsAndCountersAreWrittenTogether(t *testing.T) {
	path := filepath.Join(t.TempDir(), "data.db")
	s := open(t, path)
	if err := s.Apply(Batch{
		Records:  []RecordWrite{{Subject: "x:card", ID: "c1", Body: json.RawMessage(`{"id":"c1"}`), Base: 0}},
		Counters: []Counter{{Subject: "x:card", Scope: "all", Next: 2}},
	}); err != nil {
		t.Fatal(err)
	}
	if err := s.Apply(Batch{Records: []RecordWrite{{Subject: "x:card", ID: "c1", Body: json.RawMessage(`{"id":"c1","a":1}`), Base: 1}}}); err != nil {
		t.Fatal(err)
	}
	// 版が違う書き込みは、同じまとまりの番号の表も書かない
	if err := s.Apply(Batch{
		Records:  []RecordWrite{{Subject: "x:card", ID: "c1", Body: json.RawMessage(`{"id":"c1","a":2}`), Base: 1}},
		Counters: []Counter{{Subject: "x:card", Scope: "all", Next: 9}},
	}); !errors.Is(err, ErrConflict) {
		t.Fatalf("a stale write = %v", err)
	}
	s.Close()
	s = open(t, path)
	records, err := s.Records()
	if err != nil || len(records) != 1 || records[0].Version != 2 || string(records[0].Body) != `{"id":"c1","a":1}` {
		t.Fatalf("records = %+v, %v", records, err)
	}
	if counters, _ := s.Counters(); len(counters) != 1 || counters[0].Next != 2 {
		t.Fatalf("counters = %+v", counters)
	}
	if err := s.Apply(Batch{Records: []RecordWrite{{Subject: "x:card", ID: "c1", Base: 2, Removed: true}}}); err != nil {
		t.Fatal(err)
	}
	if records, _ := s.Records(); len(records) != 0 {
		t.Fatalf("after removing = %+v", records)
	}
	if counters, _ := s.Counters(); len(counters) != 1 || counters[0].Next != 2 {
		t.Fatalf("the number came back: %+v", counters)
	}
}

// 種類の違うレコードも、1 回の書き込みでまとめて書く（アクションが宛先のほかの種類も変えたとき）。どれかの版が違えば、全部を書かない
func TestRecordsOfDifferentKindsAreWrittenTogether(t *testing.T) {
	s := open(t, filepath.Join(t.TempDir(), "data.db"))
	if err := s.Apply(Batch{Records: []RecordWrite{
		{Subject: "x:card", ID: "c1", Body: json.RawMessage(`{"id":"c1"}`), Base: 0},
		{Subject: "x:note", ID: "c1", Body: json.RawMessage(`{"id":"c1"}`), Base: 0},
	}}); err != nil {
		t.Fatal(err)
	}
	if err := s.Apply(Batch{Records: []RecordWrite{
		{Subject: "x:card", ID: "c1", Body: json.RawMessage(`{"id":"c1","a":2}`), Base: 1},
		{Subject: "x:note", ID: "c1", Body: json.RawMessage(`{"id":"c1","a":2}`), Base: 9},
	}}); !errors.Is(err, ErrConflict) {
		t.Fatalf("a stale write = %v", err)
	}
	if got := recordsOfKind(t, s, "x:card")["c1"]; got != `{"id":"c1"}` {
		t.Fatalf("the card was written although the note was stale: %s", got)
	}
	if err := s.Apply(Batch{Records: []RecordWrite{
		{Subject: "x:card", ID: "c1", Body: json.RawMessage(`{"id":"c1","a":3}`), Base: 1},
		{Subject: "x:note", ID: "c1", Base: 1, Removed: true},
	}}); err != nil {
		t.Fatal(err)
	}
	if len(recordsOfKind(t, s, "x:note")) != 0 || recordsOfKind(t, s, "x:card")["c1"] != `{"id":"c1","a":3}` {
		t.Fatalf("after one write: card %v, note %v", recordsOfKind(t, s, "x:card"), recordsOfKind(t, s, "x:note"))
	}
}

// 記録された種類 subject のレコード（id → 本文）
func recordsOfKind(t *testing.T, s Storage, subject string) map[string]string {
	t.Helper()
	all, err := s.Records()
	if err != nil {
		t.Fatal(err)
	}
	out := map[string]string{}
	for _, r := range all {
		if r.Subject == subject {
			out[r.ID] = string(r.Body)
		}
	}
	return out
}

// ワークルームのレコードの名前（id → 名前）
func roomNames(t *testing.T, s Storage) map[string]string {
	t.Helper()
	out := map[string]string{}
	for id, body := range recordsOfKind(t, s, "@matomezu/base:workroom") {
		var r struct{ Name string }
		_ = json.Unmarshal([]byte(body), &r)
		out[id] = r.Name
	}
	return out
}

// 参加者の表は、ワークルーム・参加者のレコードになる: 受け入れ済みは部屋（id は元の参加者の id）と、そこに入る参加者、要求中は部屋を持たず希望の名前に移す。表は無くなる
func TestParticipantTableBecomesRecords(t *testing.T) {
	path := filepath.Join(t.TempDir(), "data.db")
	db, err := sql.Open("sqlite", path)
	if err != nil {
		t.Fatal(err)
	}
	before := migrations[:14:14] // 次の足し方の前まで
	for _, q := range append(before,
		fmt.Sprintf(`PRAGMA user_version = %d`, len(before)),
		`INSERT INTO participants (user, body, updated_at) VALUES ('u1', '[
			{"id":"p1","state":"joined","ai":"claude","model":"m","env":"e","sessionName":"s","link":"l1","workroom":"ひよこ","bird":"inko","palette":"forest","requestedAt":"t1","joinedAt":"t2"},
			{"id":"p2","state":"requested","ai":"codex","model":"m","env":"e","sessionName":"","link":"l2","workroom":"希望","requestedAt":"t3"},
			{"id":"p3","state":"requested","ai":"codex","model":"m","env":"e","sessionName":"","link":"l3","requestedAt":"t4"}]', 'x')`,
	) {
		if _, err := db.Exec(q); err != nil {
			t.Fatal(err)
		}
	}
	db.Close()
	s := open(t, path)
	rooms := recordsOfKind(t, s, "@matomezu/base:workroom")
	if len(rooms) != 1 || rooms["p1"] != `{"id":"p1","name":"ひよこ","bird":"inko","palette":"forest","createdAt":"t2"}` {
		t.Fatalf("workrooms = %v", rooms)
	}
	people := recordsOfKind(t, s, "@matomezu/base:participant")
	want := map[string]string{
		"p1": `{"id":"p1","state":"joined","ai":"claude","model":"m","env":"e","sessionName":"s","link":"l1","workroom":"p1","requestedAt":"t1","joinedAt":"t2"}`,
		"p2": `{"id":"p2","state":"requested","ai":"codex","model":"m","env":"e","sessionName":"","link":"l2","wantedName":"希望","requestedAt":"t3"}`,
		"p3": `{"id":"p3","state":"requested","ai":"codex","model":"m","env":"e","sessionName":"","link":"l3","requestedAt":"t4"}`,
	}
	for id, body := range want {
		if people[id] != body {
			t.Fatalf("participant %s = %s, want %s", id, people[id], body)
		}
	}
	if len(people) != 3 {
		t.Fatalf("participants = %v", people)
	}
	if _, err := s.(*sqliteStorage).db.Exec(`SELECT 1 FROM participants`); err == nil {
		t.Fatal("the participants table is still there")
	}
}

// 利用者の設定「段落の中の改行」は、設定の項目の id が markdown の物から base の物に替わる: 保存した値を付け替え、ほかの設定と、まだ選んでいない利用者の設定は変えない
func TestSoftBreakSettingMovesToBase(t *testing.T) {
	path := filepath.Join(t.TempDir(), "data.db")
	db, err := sql.Open("sqlite", path)
	if err != nil {
		t.Fatal(err)
	}
	before := migrations[:15:15] // 次の足し方の前まで
	for _, q := range append(before,
		fmt.Sprintf(`PRAGMA user_version = %d`, len(before)),
		`INSERT INTO settings (user, body, updated_at) VALUES
			('u1', '{"@matomezu/base:lang":"matomezu:ja","@matomezu/markdown:soft-break":"space","@matomezu/markdown:line-numbers":false}', 'x'),
			('u2', '{"@matomezu/base:lang":"matomezu:en"}', 'x')`,
	) {
		if _, err := db.Exec(q); err != nil {
			t.Fatal(err)
		}
	}
	db.Close()
	s := open(t, path)
	if got, _ := s.Settings("u1"); string(got) != `{"@matomezu/base:lang":"matomezu:ja","@matomezu/markdown:line-numbers":false,"@matomezu/base:soft-break":"space"}` {
		t.Fatalf("u1 settings = %s", got)
	}
	if got, _ := s.Settings("u2"); string(got) != `{"@matomezu/base:lang":"matomezu:en"}` {
		t.Fatalf("u2 settings = %s", got)
	}
}

// 1 度だけ行うアクションの印は、付けると読め、付け直しても変わらない
func TestRanOnceMarksStay(t *testing.T) {
	s := open(t, filepath.Join(t.TempDir(), "data.db"))
	got, err := s.RanOnce()
	if err != nil || len(got) != 0 {
		t.Fatalf("RanOnce = %v %v", got, err)
	}
	for range 2 {
		if err := s.MarkRanOnce("a:x"); err != nil {
			t.Fatal(err)
		}
	}
	if got, err = s.RanOnce(); err != nil || len(got) != 1 || !got["a:x"] {
		t.Fatalf("RanOnce = %v %v", got, err)
	}
}

const mailSubject = "@matomezu/base:mail"

// mailMigration は、郵便箱をレコードに移し替える足し方の番号
const mailMigration = 17

// 郵便箱の移し替えの前まで表の形を進めたデータベース（path）に、qs を流す
func beforeMailMigration(t *testing.T, path string, qs ...string) {
	t.Helper()
	db, err := sql.Open("sqlite", path)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	before := migrations[:mailMigration:mailMigration] // 郵便箱の移し替えの前まで
	for _, q := range append(append(before, fmt.Sprintf(`PRAGMA user_version = %d`, len(before))), qs...) {
		if _, err := db.Exec(q); err != nil {
			t.Fatal(err)
		}
	}
}

// 郵便箱の表は、郵便 1 通ずつのレコードになる: 届いた順 order は並びの位置の順に 1 から、版は 1、時刻は郵便箱の行の時刻。
// 読むのは利用者 me の行だけ。id の無い郵便・オブジェクトでない物は飛ばし（番号は空ける）、同じ id は先の物を残す。
// 番号の表の区切り mail は、いちばん大きい order の次。郵便箱の表は無くなり、表の形の版は 1 つ進む
func TestMailboxBecomesRecords(t *testing.T) {
	path := filepath.Join(t.TempDir(), "data.db")
	beforeMailMigration(t, path,
		`INSERT INTO mailbox (user, body, updated_at) VALUES ('me', '[
			{"id":"m1","mail":"@matomezu/base:letter","from":"a","sentAt":"t1","props":{"title":"一"}},
			{"mail":"@matomezu/base:letter","from":"a","sentAt":"t2","props":{}},
			{"id":"","mail":"@matomezu/base:letter","from":"a","sentAt":"t3","props":{}},
			"not a mail",
			{"id":"m1","mail":"@matomezu/base:letter","from":"b","sentAt":"t4","props":{"title":"重なり"}},
			{"id":"m2","mail":"@x/gone","from":"b","sentAt":"t5","seenAt":"t6","props":{"a":1}}]', 'stamp'),
			('other', '[{"id":"o1","mail":"@matomezu/base:letter","from":"a","sentAt":"t","props":{}}]', 'x')`,
	)
	s := open(t, path)
	mails := recordsOfKind(t, s, mailSubject)
	want := map[string]string{
		"m1": `{"id":"m1","mail":"@matomezu/base:letter","from":"a","sentAt":"t1","props":{"title":"一"},"order":1}`,
		"m2": `{"id":"m2","mail":"@x/gone","from":"b","sentAt":"t5","seenAt":"t6","props":{"a":1},"order":6}`,
	}
	if len(mails) != len(want) {
		t.Fatalf("mail = %v", mails)
	}
	for id, body := range want {
		if mails[id] != body {
			t.Fatalf("mail %s = %s, want %s", id, mails[id], body)
		}
	}
	all, err := s.Records()
	if err != nil {
		t.Fatal(err)
	}
	for _, r := range all {
		if r.Version != 1 {
			t.Fatalf("version of %s = %d", r.ID, r.Version)
		}
	}
	var at string
	if err := s.(*sqliteStorage).db.QueryRow(`SELECT updated_at FROM records WHERE id = 'm1'`).Scan(&at); err != nil || at != "stamp" {
		t.Fatalf("updated_at = %q, %v", at, err)
	}
	counters, err := s.Counters()
	if err != nil || len(counters) != 1 || counters[0] != (Counter{Subject: mailSubject, Scope: "mail", Next: 7}) {
		t.Fatalf("counters = %+v, %v", counters, err)
	}
	if _, err := s.(*sqliteStorage).db.Exec(`SELECT 1 FROM mailbox`); err == nil {
		t.Fatal("the mailbox table is still there")
	}
	var version int
	if err := s.(*sqliteStorage).db.QueryRow(`PRAGMA user_version`).Scan(&version); err != nil || version != len(migrations) {
		t.Fatalf("user_version = %d, %v; want %d", version, err, len(migrations))
	}
}

// 空の郵便箱・郵便箱の行の無いデータは、郵便のレコードも番号の表も作らずに移し替える
func TestEmptyMailboxBecomesNoRecords(t *testing.T) {
	for name, qs := range map[string][]string{
		"empty": {`INSERT INTO mailbox (user, body, updated_at) VALUES ('me', '[]', 'x')`},
		"none":  nil,
	} {
		t.Run(name, func(t *testing.T) {
			path := filepath.Join(t.TempDir(), "data.db")
			beforeMailMigration(t, path, qs...)
			s := open(t, path)
			if mails := recordsOfKind(t, s, mailSubject); len(mails) != 0 {
				t.Fatalf("mail = %v", mails)
			}
			if counters, err := s.Counters(); err != nil || len(counters) != 0 {
				t.Fatalf("counters = %+v, %v", counters, err)
			}
		})
	}
}

// ticketsMigration は、閉じる者のいない AI 編集チケットを閉じる足し方の番号
const ticketsMigration = 18

// 閉じる者のいない AI 編集チケット（key があり、失敗にも消えたことにもしておらず、同じ id の郵便のレコードが無い物）は閉じる（AI には渡さない）。
// 郵便が残っている物・失敗にした物・消えたと記した物は残る。そのあとの移し替え（全部で 1 つの並びにする）で、key の無い物は捨てられ、残った物は置いてあったブックの id を持つ
func TestTicketsOfGoneMailAreClosed(t *testing.T) {
	path := filepath.Join(t.TempDir(), "data.db")
	db, err := sql.Open("sqlite", path)
	if err != nil {
		t.Fatal(err)
	}
	before := migrations[:ticketsMigration:ticketsMigration] // 次の足し方の前まで
	for _, q := range append(before,
		fmt.Sprintf(`PRAGMA user_version = %d`, len(before)),
		`INSERT INTO records (subject, id, body, version, updated_at) VALUES ('@matomezu/base:mail', 'kept', '{}', 1, 'x')`,
		`INSERT INTO ai_edit_tickets (book, body, updated_at) VALUES
			('b1', '[{"act":"a1","at":"t1","version":1},{"key":"gone","subject":"@matomezu/base:mail","at":"t2","version":1},{"key":"kept","at":"t3","version":1},
				{"key":"failed","failed":true,"at":"t4","version":1},{"key":"removed","removed":"user","at":"t5","version":1}]', 'x'),
			('b2', '[{"key":"gone2","at":"t","version":1}]', 'x')`,
	) {
		if _, err := db.Exec(q); err != nil {
			t.Fatal(err)
		}
	}
	db.Close()
	s := open(t, path)
	tickets, err := s.AIEditTickets()
	if err != nil {
		t.Fatal(err)
	}
	var keys []string
	var list []struct {
		Act  string `json:"act"`
		Key  string `json:"key"`
		Book string `json:"book"`
	}
	if err := json.Unmarshal(tickets, &list); err != nil {
		t.Fatal(err)
	}
	for _, c := range list {
		keys = append(keys, c.Act+c.Key+"@"+c.Book)
	}
	if fmt.Sprint(keys) != "[kept@b1 failed@b1 removed@b1]" {
		t.Fatalf("tickets = %v", keys)
	}
	var version int
	if err := s.(*sqliteStorage).db.QueryRow(`PRAGMA user_version`).Scan(&version); err != nil || version != len(migrations) {
		t.Fatalf("user_version = %d, %v; want %d", version, err, len(migrations))
	}
}

// ブックごとのアノテーションの並びは、結び付く物の最後のあるページへ振り分ける。そのページに無い物の id は外し、どのページにも当たらない物は捨てる
func TestAnnotationsMoveToTheirPages(t *testing.T) {
	path := filepath.Join(t.TempDir(), "data.db")
	db, err := sql.Open("sqlite", path)
	if err != nil {
		t.Fatal(err)
	}
	// ページごとの表を作る前の形まで進める
	for i, m := range migrations[:21] {
		if _, err := db.Exec(m); err != nil {
			t.Fatalf("migration %d: %v", i, err)
		}
	}
	book := `{"id":"b1","title":"t","lineup":[
		{"kind":"page","id":"p1","items":[{"id":"a"},{"id":"b","shapes":[{"id":"b1"}]}]},
		{"kind":"binder","id":"f1","lineup":[{"kind":"page","id":"p2","slide":[{"id":"c"}]}]}]}`
	list := `[{"id":"n1","annotation":"k","anchors":["a","b1"],"props":{}},
		{"id":"n2","annotation":"k","anchors":["a","c"],"props":{}},
		{"id":"n3","annotation":"k","anchors":["gone"],"props":{}},
		{"id":"n4","annotation":"k","anchors":["p1"],"props":{}}]`
	if _, err := db.Exec(`INSERT INTO books (id, body, version, updated_at) VALUES ('b1', ?, 1, 't')`, book); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`INSERT INTO annotations (book, body, updated_at) VALUES ('b1', ?, 't')`, list); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`PRAGMA user_version = 21`); err != nil {
		t.Fatal(err)
	}
	db.Close()
	s := open(t, path)
	all, err := s.Annotations()
	if err != nil {
		t.Fatal(err)
	}
	if len(all) != 2 ||
		string(all["p1"]) != `[{"anchors":["a","b1"],"annotation":"k","id":"n1","props":{}}]` ||
		string(all["p2"]) != `[{"anchors":["c"],"annotation":"k","id":"n2","props":{}}]` {
		t.Fatalf("annotations = %v", all)
	}
}

// 変更提案郵便の、当たる物の送った時の値は、物のある所（ページ。どのページにも無い物はブック）ごとの表に直す
func TestProposalSnapshotsMoveToTheirPlaces(t *testing.T) {
	path := filepath.Join(t.TempDir(), "data.db")
	db, err := sql.Open("sqlite", path)
	if err != nil {
		t.Fatal(err)
	}
	for i, m := range migrations[:22] {
		if _, err := db.Exec(m); err != nil {
			t.Fatalf("migration %d: %v", i, err)
		}
	}
	book := `{"id":"b1","title":"t","lineup":[{"kind":"page","id":"p1","items":[{"id":"a"}]},{"kind":"binder","id":"f1","lineup":[{"kind":"page","id":"p2","items":[{"id":"c"}]}]}]}`
	mail := `{"id":"m1","mail":"@matomezu/base:proposal","props":{"book":"b1","snapshot":{"a":{"id":"a"},"p2":{"id":"p2"},"f1":{"id":"f1"},"gone":1}}}`
	letter := `{"id":"m2","mail":"@matomezu/base:letter","props":{"title":"x"}}`
	if _, err := db.Exec(`INSERT INTO books (id, body, version, updated_at) VALUES ('b1', ?, 1, 't')`, book); err != nil {
		t.Fatal(err)
	}
	for id, body := range map[string]string{"m1": mail, "m2": letter} {
		if _, err := db.Exec(`INSERT INTO records (subject, id, body, version, updated_at) VALUES ('@matomezu/base:mail', ?, ?, 1, 't')`, id, body); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := db.Exec(`PRAGMA user_version = 22`); err != nil {
		t.Fatal(err)
	}
	db.Close()
	s := open(t, path)
	got, err := s.Record("@matomezu/base:mail", "m1")
	if err != nil || got == nil {
		t.Fatalf("record = %v, %v", got, err)
	}
	want := `{"id":"m1","mail":"@matomezu/base:proposal","props":{"book":"b1","snapshot":{"b1":{"f1":{"id":"f1"},"gone":1},"p1":{"a":{"id":"a"}},"p2":{"p2":{"id":"p2"}}}}}`
	if string(got.Body) != want {
		t.Fatalf("mail = %s", got.Body)
	}
	if other, _ := s.Record("@matomezu/base:mail", "m2"); other == nil || string(other.Body) != letter {
		t.Fatalf("letter = %v", other)
	}
}

// ブックの表は、フォルダとページとエントリの表に分かれて無くなる: ブックのフォルダは版と書いた時刻を引き継ぎ、バインダとページの版は 1。
// 分けられないブック（本文が JSON でない・本文の id が行の id と違う）は、本文そのままのフォルダの 1 行として残る。
// 先のブックがもう使っている id のページと、ブックの id と同じ id のページは分けず、そのフォルダの並びに中身ごと残る
func TestBooksBecomePagesAndFolders(t *testing.T) {
	path := filepath.Join(t.TempDir(), "data.db")
	db, err := sql.Open("sqlite", path)
	if err != nil {
		t.Fatal(err)
	}
	// ページとフォルダの表を作る前の形まで進める
	for i, m := range migrations[:23] {
		if _, err := db.Exec(m); err != nil {
			t.Fatalf("migration %d: %v", i, err)
		}
	}
	other := `{"id":"zz","lineup":[{"kind":"page","id":"p9"}]}`
	for _, b := range []struct {
		id, body string
		version  int
	}{
		{"a1", `{"id":"a1","title":"A","lineup":[{"kind":"page","id":"p1",  "items":[ {"id":"i"} ]},{"kind":"binder","id":"f1","title":"B","pageType":"x:slide","lineup":[{"kind":"page","id":"p2"}]},{"kind":"page","id":"c1"}]}`, 5},
		{"b2", `{"id":"b2","lineup":[{"kind":"page","id":"p1","second":true},{"kind":"page","id":"p3"}]}`, 2},
		{"c1", `{"id":"c1"}`, 1},
		{"d-broken", `not json`, 3},
		{"e-other", other, 4},
	} {
		if _, err := db.Exec(`INSERT INTO books (id, body, version, updated_at) VALUES (?, ?, ?, ?)`, b.id, b.body, b.version, "at-"+b.id); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := db.Exec(`PRAGMA user_version = 23`); err != nil {
		t.Fatal(err)
	}
	db.Close()
	s := open(t, path)
	pages, folders := stored(t, s)
	if want := map[string]string{
		"a1":       `5 {"folderRole":"book","id":"a1","lineup":[{"id":"p1","kind":"page"},{"id":"f1","kind":"binder"},{"kind":"page","id":"c1"}],"title":"A"}`,
		"f1":       `1 {"folderRole":"binder","id":"f1","lineup":[{"id":"p2","kind":"page"}],"pageType":"x:slide","title":"B"}`,
		"b2":       `2 {"folderRole":"book","id":"b2","lineup":[{"kind":"page","id":"p1","second":true},{"id":"p3","kind":"page"}]}`,
		"c1":       `1 {"folderRole":"book","id":"c1"}`,
		"d-broken": `3 not json`,
		"e-other":  `4 ` + other,
	}; !maps.Equal(folders, want) {
		t.Fatalf("folders = %v", folders)
	}
	if want := map[string]string{
		"p1": `1 {"kind":"page","id":"p1",  "items":[ {"id":"i"} ]}`,
		"p2": `1 {"kind":"page","id":"p2"}`,
		"p3": `1 {"kind":"page","id":"p3"}`,
	}; !maps.Equal(pages, want) {
		t.Fatalf("pages = %v", pages)
	}
	entries, err := s.Entries()
	old := entries["a1"]
	if err != nil || old == "" || entries[old] != HomeID || !maps.Equal(entries, map[string]string{"p1": "a1", "f1": "a1", "p2": "f1", "p3": "b2",
		"a1": old, "b2": old, "c1": old, "d-broken": old, "e-other": old, old: HomeID}) {
		t.Fatalf("entries = %v, %v", entries, err)
	}
	// 書いた時刻は、ブックの行の時刻を引き継ぐ（バインダとページも、ブックの時刻に数える）
	if touched, _ := s.Touched(); !maps.Equal(touched, map[string]string{"a1": "at-a1", "b2": "at-b2", "c1": "at-c1", "d-broken": "at-d-broken", "e-other": "at-e-other"}) {
		t.Fatalf("touched = %v", touched)
	}
	var n int
	if err := s.(*sqliteStorage).db.QueryRow(`SELECT COUNT(*) FROM sqlite_master WHERE name = 'books'`).Scan(&n); err != nil || n != 0 {
		t.Fatalf("the books table is still there (%d, %v)", n, err)
	}
}

// ticketsListMigration は、AI 編集チケットを全部で 1 つの並びにする足し方の番号
const ticketsListMigration = 24

// ブックごとの AI 編集チケットの並びは、全部で 1 つの並びになる。key で見分ける物だけが、置いてあったブックの id を持って残り（変えた時点の古い順）、
// AI のアクションごとの物（act）は捨てる。読めない行は捨てる。書き直すと置き換わり、空の並びにすると消える
func TestTicketsBecomeOneList(t *testing.T) {
	path := filepath.Join(t.TempDir(), "data.db")
	db, err := sql.Open("sqlite", path)
	if err != nil {
		t.Fatal(err)
	}
	before := migrations[:ticketsListMigration:ticketsListMigration]
	for i, q := range before {
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
	for _, q := range []string{
		fmt.Sprintf(`PRAGMA user_version = %d`, len(before)),
		`INSERT INTO ai_edit_tickets (book, body, updated_at) VALUES
			('b2', '[{"act":"a1","at":"t1"},{"key":"m2","subject":"@matomezu/base:mail","at":"t3","failed":true,"changed":["x"]}]', 'x'),
			('b1', '[{"key":"m1","subject":"@matomezu/base:mail","at":"t2"},{"act":"a2","at":"t4","lost":[{"at":"title"}]}]', 'x'),
			('b3', 'not json', 'x')`,
	} {
		if _, err := db.Exec(q); err != nil {
			t.Fatal(err)
		}
	}
	db.Close()
	s := open(t, path)
	want := `[{"at":"t2","book":"b1","key":"m1","subject":"@matomezu/base:mail"},{"at":"t3","book":"b2","changed":["x"],"failed":true,"key":"m2","subject":"@matomezu/base:mail"}]`
	if got, err := s.AIEditTickets(); err != nil || string(got) != want {
		t.Fatalf("tickets = %s, %v; want %s", got, err, want)
	}
	if err := s.PutAIEditTickets(json.RawMessage(`[{"act":"a","at":"t"}]`)); err != nil {
		t.Fatal(err)
	}
	if got, _ := s.AIEditTickets(); string(got) != `[{"act":"a","at":"t"}]` {
		t.Fatalf("tickets after putting = %s", got)
	}
	if err := s.PutAIEditTickets(json.RawMessage(`[]`)); err != nil {
		t.Fatal(err)
	}
	if got, err := s.AIEditTickets(); err != nil || got != nil {
		t.Fatalf("tickets after emptying = %s, %v", got, err)
	}
}
