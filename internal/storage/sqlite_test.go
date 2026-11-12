package storage

import (
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"path/filepath"
	"testing"
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

func TestPutBookChecksTheVersion(t *testing.T) {
	s := open(t, filepath.Join(t.TempDir(), "data.db"))
	v, _, err := s.PutBook("b1", json.RawMessage(`{"id":"b1"}`), 0)
	if err != nil || v != 1 {
		t.Fatalf("first put = %d, %v", v, err)
	}
	if _, _, err := s.PutBook("b1", json.RawMessage(`{"id":"b1","x":1}`), 0); !errors.Is(err, ErrConflict) {
		t.Fatalf("adding an existing book = %v; want ErrConflict", err)
	}
	if v, _, err = s.PutBook("b1", json.RawMessage(`{"id":"b1","x":2}`), 1); err != nil || v != 2 {
		t.Fatalf("put on version 1 = %d, %v", v, err)
	}
	_, have, err := s.PutBook("b1", json.RawMessage(`{"id":"b1","x":3}`), 1)
	if !errors.Is(err, ErrConflict) || have == nil || have.Version != 2 || string(have.Body) != `{"id":"b1","x":2}` {
		t.Fatalf("stale put = %v, %+v; want ErrConflict with version 2", err, have)
	}
	if _, _, err := s.PutBook("b9", json.RawMessage(`{}`), 3); !errors.Is(err, ErrConflict) {
		t.Fatalf("updating a missing book = %v; want ErrConflict", err)
	}
	books, err := s.Books()
	if err != nil || len(books) != 1 || books[0].Version != 2 || string(books[0].Body) != `{"id":"b1","x":2}` {
		t.Fatalf("Books() = %+v, %v", books, err)
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
	path := filepath.Join(t.TempDir(), "data.db")
	s, err := OpenSQLite(path)
	if err != nil {
		t.Fatal(err)
	}
	s.PutBook("b1", json.RawMessage(`{"id":"b1"}`), 0)
	s.(*sqliteStorage).db.Exec(`PRAGMA user_version = 99`)
	s.Close()
	if _, err := OpenSQLite(path); err == nil {
		t.Fatal("opening data of a newer form succeeded")
	}
	path2 := filepath.Join(t.TempDir(), "data.db")
	a := open(t, path2)
	a.PutBook("b1", json.RawMessage(`{"id":"b1"}`), 0)
	a.Close()
	b := open(t, path2)
	if books, _ := b.Books(); len(books) != 1 {
		t.Fatalf("books after reopen = %+v", books)
	}
}

func TestTouchedIsTheNewerOfOpenedAndWritten(t *testing.T) {
	s := open(t, filepath.Join(t.TempDir(), "data.db"))
	if _, _, err := s.PutBook("b1", json.RawMessage(`{"id":"b1"}`), 0); err != nil {
		t.Fatal(err)
	}
	got, err := s.Touched()
	if err != nil || got["b1"] == "" {
		t.Fatalf("touched after writing = %v, %v", got, err)
	}
	written := got["b1"]
	// 開いた時刻は、DB に無いブックにも残る。書いた時刻より新しければ、そちら
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
	if got, _ = s.Touched(); got["b1"] != written {
		t.Fatalf("touched = %v; want the written time %s", got, written)
	}
}

// DeleteBook はブックと開いた時刻を消す
func TestDeleteBook(t *testing.T) {
	s := open(t, filepath.Join(t.TempDir(), "data.db"))
	for _, id := range []string{"b1", "b2"} {
		if _, _, err := s.PutBook(id, json.RawMessage(`{"id":"`+id+`"}`), 0); err != nil {
			t.Fatal(err)
		}
	}
	if err := s.Open("b2", "2026-10-29T00:00:00.000Z"); err != nil {
		t.Fatal(err)
	}
	if err := s.DeleteBook("b2"); err != nil {
		t.Fatal(err)
	}
	if books, _ := s.Books(); len(books) != 1 || books[0].ID != "b1" {
		t.Fatalf("books = %+v", books)
	}
	if touched, _ := s.Touched(); touched["b2"] != "" {
		t.Fatalf("touched keeps a deleted book: %v", touched)
	}
}

// アノテーションはブックごとに、ブックとは別に持つ。空の並びを書くと消え、ブックを消すと一緒に消える
func TestAnnotationsPerBook(t *testing.T) {
	s := open(t, filepath.Join(t.TempDir(), "data.db"))
	for _, id := range []string{"b1", "b2"} {
		if _, _, err := s.PutBook(id, json.RawMessage(`{"id":"`+id+`"}`), 0); err != nil {
			t.Fatal(err)
		}
		if err := s.PutAnnotations(id, json.RawMessage(`[{"id":"c"}]`)); err != nil {
			t.Fatal(err)
		}
	}
	if all, _ := s.Annotations(); len(all) != 2 || string(all["b1"]) != `[{"id":"c"}]` {
		t.Fatalf("annotations = %v", all)
	}
	if err := s.PutAnnotations("b1", json.RawMessage(`[]`)); err != nil {
		t.Fatal(err)
	}
	if err := s.DeleteBook("b2"); err != nil {
		t.Fatal(err)
	}
	if all, _ := s.Annotations(); len(all) != 0 {
		t.Fatalf("annotations after clearing and deleting = %v", all)
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
	books, err := s.Books()
	if err != nil || len(books) != 2 {
		t.Fatalf("books = %+v, %v", books, err)
	}
	if string(books[0].Body) != `{"id":"b1","trashed":"2026-10-29T01:00:00.000Z"}` || string(books[1].Body) != `{"id":"b2"}` {
		t.Fatalf("bodies = %s, %s", books[0].Body, books[1].Body)
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
	if books, err := s.Books(); err != nil || len(books) != 1 || books[0].ID != "b1" {
		t.Fatalf("books = %+v, %v", books, err)
	}
	if got, _ := s.Touched(); len(got) != 1 || got["b1"] == "" {
		t.Fatalf("touched = %v", got)
	}
	if all, _ := s.Annotations(); len(all) != 0 {
		t.Fatalf("annotations = %v", all)
	}
}

// 参加者の表は利用者ごとに持ち、書き直せて、開き直しても残る
func TestParticipantsPerUser(t *testing.T) {
	path := filepath.Join(t.TempDir(), "data.db")
	s := open(t, path)
	if got, err := s.Participants("u1"); err != nil || got != nil {
		t.Fatalf("empty participants = %s, %v", got, err)
	}
	for user, body := range map[string]string{"u1": `[{"id":"p1"}]`, "u2": `[]`} {
		if err := s.PutParticipants(user, json.RawMessage(body)); err != nil {
			t.Fatal(err)
		}
	}
	if err := s.PutParticipants("u1", json.RawMessage(`[{"id":"p1"},{"id":"p2"}]`)); err != nil {
		t.Fatal(err)
	}
	s.Close()
	s = open(t, path)
	if got, _ := s.Participants("u1"); string(got) != `[{"id":"p1"},{"id":"p2"}]` {
		t.Fatalf("u1 = %s", got)
	}
	if got, _ := s.Participants("u2"); string(got) != `[]` {
		t.Fatalf("u2 = %s", got)
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
		`INSERT INTO mailbox (user, body, updated_at) VALUES ('u1', '[{"id":"m1","mail":"@matomezu/base:join-request","project":"default","props":{"projects":["default"],"a":1}},{"id":"m2","mail":"@x/other","project":"default","props":{"projects":["keep"]}}]', 'x'), ('u2', '[]', 'x')`,
		`INSERT INTO participants (user, body, updated_at) VALUES ('u1', '[{"id":"p1","projects":["default"],"link":"l"},{"id":"p2"}]', 'x')`,
	) {
		if _, err := db.Exec(q); err != nil {
			t.Fatal(err)
		}
	}
	db.Close()
	s := open(t, path)
	books, err := s.Books()
	if err != nil || len(books) != 2 {
		t.Fatalf("books = %+v, %v", books, err)
	}
	if string(books[0].Body) != `{"id":"b1","title":"x"}` || string(books[1].Body) != `{"id":"b2"}` {
		t.Fatalf("bodies = %s, %s", books[0].Body, books[1].Body)
	}
	if got, _ := s.Mailbox("u1"); string(got) != `[{"id":"m1","mail":"@matomezu/base:join-request","props":{"a":1}},{"id":"m2","mail":"@x/other","props":{"projects":["keep"]}}]` {
		t.Fatalf("mailbox = %s", got)
	}
	if got, _ := s.Mailbox("u2"); string(got) != `[]` {
		t.Fatalf("empty mailbox = %s", got)
	}
	if got, _ := s.Participants("u1"); string(got) != `[{"id":"p1","link":"l"},{"id":"p2"}]` {
		t.Fatalf("participants = %s", got)
	}
}

// 1 つのまとまり（Apply）は、全部書くか、何も書かないか。版が違うブックが 1 つでもあれば、前に並べた物も書かない（ErrConflict と置いてあるブックを返す）
func TestApplyWritesAllOrNothingOnAConflict(t *testing.T) {
	s := open(t, filepath.Join(t.TempDir(), "data.db"))
	if _, _, err := s.PutBook("b2", json.RawMessage(`{"id":"b2"}`), 0); err != nil {
		t.Fatal(err)
	}
	have, err := s.Apply(Batch{
		Books:         []BookWrite{{"b1", json.RawMessage(`{"id":"b1"}`), 0}, {"b2", json.RawMessage(`{"id":"b2","x":1}`), 7}},
		Settings:      &UserBody{"me", json.RawMessage(`{"a":1}`)},
		Annotations:   []BookBody{{"b1", json.RawMessage(`[{"id":"n1"}]`)}},
		AIEditTickets: []BookBody{{"b1", json.RawMessage(`[{"at":"t"}]`)}},
	})
	if !errors.Is(err, ErrConflict) || have == nil || have.Version != 1 {
		t.Fatalf("apply = %+v, %v; want ErrConflict with the stored book", have, err)
	}
	books, _ := s.Books()
	settings, _ := s.Settings("me")
	notes, _ := s.Annotations()
	tickets, _ := s.AIEditTickets()
	if len(books) != 1 || books[0].ID != "b2" || settings != nil || len(notes) != 0 || len(tickets) != 0 {
		t.Fatalf("something was written: books %v, settings %s, annotations %v, tickets %v", books, settings, notes, tickets)
	}
}

// SQL の失敗（ここでは郵便箱への書き込みが断られる）の途中でも、前に書いた物は巻き戻る。1 つのまとまりは、書く順にブック → 消すブック → 設定 → 郵便箱 → …
func TestApplyRollsBackWhenALaterWriteFails(t *testing.T) {
	path := filepath.Join(t.TempDir(), "data.db")
	s := open(t, path)
	db, err := sql.Open("sqlite", path)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	if _, err := db.Exec(`CREATE TRIGGER refuse_mailbox BEFORE INSERT ON mailbox BEGIN SELECT RAISE(ABORT, 'refused'); END`); err != nil {
		t.Fatal(err)
	}
	if _, err := s.Apply(Batch{
		Books:    []BookWrite{{"b1", json.RawMessage(`{"id":"b1"}`), 0}},
		Settings: &UserBody{"me", json.RawMessage(`{"a":1}`)},
		Mailbox:  &UserBody{"me", json.RawMessage(`[{"id":"m1"}]`)},
	}); err == nil {
		t.Fatal("apply with a refused write succeeded")
	}
	books, _ := s.Books()
	settings, _ := s.Settings("me")
	if len(books) != 0 || settings != nil {
		t.Fatalf("not rolled back: books %v, settings %s", books, settings)
	}
	// 書けるようになれば、同じまとまりが書ける
	if _, err := db.Exec(`DROP TRIGGER refuse_mailbox`); err != nil {
		t.Fatal(err)
	}
	if _, err := s.Apply(Batch{Books: []BookWrite{{"b1", json.RawMessage(`{"id":"b1"}`), 0}}, Mailbox: &UserBody{"me", json.RawMessage(`[{"id":"m1"}]`)}}); err != nil {
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
		`INSERT INTO participants (user, body, updated_at) VALUES ('u1', '[{"id":"p1","workroom":"あいうえおかきくけこさしすせそたちつてとなにぬ"},{"id":"p2","workroom":"短い"},{"id":"p3"}]', 'x'), ('u2', '[]', 'x')`,
		`INSERT INTO mailbox (user, body, updated_at) VALUES ('u1', '[{"id":"m1","mail":"@matomezu/base:join-request","props":{"workroom":"abcdefghij klmnopqrstuvwxyz"}},{"id":"m3","mail":"@x/other","props":{"workroom":"abcdefghij klmnopqrstuvwxyz"}},{"id":"m2","props":{"a":1}}]', 'x')`,
	) {
		if _, err := db.Exec(q); err != nil {
			t.Fatal(err)
		}
	}
	db.Close()
	s := open(t, path)
	if got, _ := s.Participants("u1"); string(got) != `[{"id":"p1","workroom":"あいうえおかきくけこさしすせそたちつてと"},{"id":"p2","workroom":"短い"},{"id":"p3"}]` {
		t.Fatalf("participants = %s", got)
	}
	if got, _ := s.Participants("u2"); string(got) != `[]` {
		t.Fatalf("empty participants = %s", got)
	}
	if got, _ := s.Mailbox("u1"); string(got) != `[{"id":"m1","mail":"@matomezu/base:join-request","props":{"workroom":"abcdefghij klmnopqrs"}},{"id":"m3","mail":"@x/other","props":{"workroom":"abcdefghij klmnopqrstuvwxyz"}},{"id":"m2","props":{"a":1}}]` {
		t.Fatalf("mailbox = %s", got)
	}
}
