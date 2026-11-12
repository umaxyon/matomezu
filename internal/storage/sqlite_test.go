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
		`INSERT INTO participants (user, body, updated_at) VALUES ('u1', '[{"id":"p1","state":"joined","workroom":"あいうえおかきくけこさしすせそたちつてとなにぬ","bird":"inko","ai":"a","model":"m","env":"e","sessionName":"","link":"l1","requestedAt":"t"},{"id":"p2","state":"joined","workroom":"短い","bird":"suzume","ai":"a","model":"m","env":"e","sessionName":"","link":"l2","requestedAt":"t"}]', 'x'), ('u2', '[]', 'x')`,
		`INSERT INTO mailbox (user, body, updated_at) VALUES ('u1', '[{"id":"m1","mail":"@matomezu/base:join-request","props":{"workroom":"abcdefghij klmnopqrstuvwxyz"}},{"id":"m3","mail":"@x/other","props":{"workroom":"abcdefghij klmnopqrstuvwxyz"}},{"id":"m2","props":{"a":1}}]', 'x')`,
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
	if got, _ := s.Mailbox("u1"); string(got) != `[{"id":"m1","mail":"@matomezu/base:join-request","props":{"workroom":"abcdefghij klmnopqrs"}},{"id":"m3","mail":"@x/other","props":{"workroom":"abcdefghij klmnopqrstuvwxyz"}},{"id":"m2","props":{"a":1}}]` {
		t.Fatalf("mailbox = %s", got)
	}
}

// レコードは種類・id ごとに 1 件、版つきで書き、番号の表と同じ 1 回の書き込みで進める。版が違えば何も書かず、開き直しても残る
func TestRecordsAndCountersAreWrittenTogether(t *testing.T) {
	path := filepath.Join(t.TempDir(), "data.db")
	s := open(t, path)
	if _, err := s.Apply(Batch{
		Records:  []RecordWrite{{Subject: "x:card", ID: "c1", Body: json.RawMessage(`{"id":"c1"}`), Base: 0}},
		Counters: []Counter{{Subject: "x:card", Scope: "all", Next: 2}},
	}); err != nil {
		t.Fatal(err)
	}
	if _, err := s.Apply(Batch{Records: []RecordWrite{{Subject: "x:card", ID: "c1", Body: json.RawMessage(`{"id":"c1","a":1}`), Base: 1}}}); err != nil {
		t.Fatal(err)
	}
	// 版が違う書き込みは、同じまとまりの番号の表も書かない
	if _, err := s.Apply(Batch{
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
	if _, err := s.Apply(Batch{Records: []RecordWrite{{Subject: "x:card", ID: "c1", Base: 2, Removed: true}}}); err != nil {
		t.Fatal(err)
	}
	if records, _ := s.Records(); len(records) != 0 {
		t.Fatalf("after removing = %+v", records)
	}
	if counters, _ := s.Counters(); len(counters) != 1 || counters[0].Next != 2 {
		t.Fatalf("the number came back: %+v", counters)
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
