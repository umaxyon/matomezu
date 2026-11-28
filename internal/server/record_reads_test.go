package server

import (
	"encoding/json"
	"fmt"
	"path/filepath"
	"testing"

	"github.com/umaxyon/matomezu/internal/engine"
	"github.com/umaxyon/matomezu/internal/storage"
)

// countingStore は、置き場所から読んだレコードの中身の数（bodies）と、索引キーだけ読んだ行の数（keyRows）を数える
type countingStore struct {
	storage.Storage
	bodies, keyRows int
}

func (c *countingStore) Record(subject, id string) (*storage.Record, error) {
	r, err := c.Storage.Record(subject, id)
	if r != nil {
		c.bodies++
	}
	return r, err
}

func (c *countingStore) Find(subject string, q storage.Query) ([]storage.Found, error) {
	found, err := c.Storage.Find(subject, q)
	if q.KeysOnly {
		c.keyRows += len(found)
	} else {
		c.bodies += len(found)
	}
	return found, err
}

// 郵便を 1 通送るとき、今ある郵便の中身は 1 通も開けない（読むのは索引キーだけ）。今ある郵便が増えても変わらない
func TestMailSendOpensNoBodies(t *testing.T) {
	t.Parallel()
	inner, err := storage.OpenSQLite(filepath.Join(t.TempDir(), "data.db"))
	if err != nil {
		t.Fatal(err)
	}
	cleanup(t, func() { inner.Close() })
	eng, err := engine.New()
	if err != nil {
		t.Fatal(err)
	}
	store := &countingStore{Storage: inner}
	hub, err := NewHub(store, eng)
	if err != nil {
		t.Fatal(err)
	}
	cleanup(t, hub.CloseAll)
	sendMail := func(i int) {
		t.Helper()
		args := json.RawMessage(fmt.Sprintf(`{"from":"t","title":"mail %d","body":"body"}`, i))
		done, err := hub.Perform(Perform{Actions: []engine.BulkAction{{Action: "@matomezu/base:mail-send", Args: args, Lang: "en"}}})
		if err != nil || !done.OK {
			t.Fatalf("send %d: %+v %v", i, done, err)
		}
	}
	const have = 50
	for i := range have {
		sendMail(i)
	}
	store.bodies, store.keyRows = 0, 0
	sendMail(have)
	if store.bodies != 0 || store.keyRows != have {
		t.Fatalf("one more letter with %d in the mailbox read %d bodies and %d key rows; want 0 and %d", have, store.bodies, store.keyRows, have)
	}
	if found, err := inner.Find("@matomezu/base:mail", storage.Query{Order: &storage.Order{Key: "order", Desc: true}, Limit: 1, KeysOnly: true}); err != nil || len(found) != 1 || found[0].Keys["order"] != float64(have+1) {
		t.Fatalf("newest by the order key: %+v %v", found, err)
	}
}
