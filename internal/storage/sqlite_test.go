package storage

import (
	"encoding/json"
	"errors"
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
