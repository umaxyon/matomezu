package server

import (
	"encoding/json"
	"path/filepath"
	"strings"
	"testing"

	"github.com/umaxyon/matomezu/internal/engine"
	"github.com/umaxyon/matomezu/internal/storage"
)

// AI が手紙を送ると、利用者の郵便箱に 1 通だけ届き、画面の読む口（/api/data）と AI の読む口（/api/ai/mail）に出る。
// 画面から利用者が見たと知らせると、AI の読む口に見た時点が出る（AI に断る所は store のテストが見る）
func TestAISendsMail(t *testing.T) {
	s := newServer(t, nil)
	ai := map[string]string{"Authorization": "Bearer secret"}
	send(t, "POST", s.URL+"/api/ai/perform", `{"action":"@matomezu/base:mail-send","args":{"from":"D64","title":"済みました"}}`, ai)
	_, data := send(t, "GET", s.URL+"/api/data", "", nil)
	if strings.Count(data, `"mail":"@matomezu/base:letter"`) != 1 || !strings.Contains(data, `"props":{"title":"済みました","body":""}`) {
		t.Fatalf("data = %s", data)
	}
	_, got := send(t, "GET", s.URL+"/api/ai/mail", "", ai)
	if !strings.Contains(got, `"from":"D64"`) || strings.Contains(got, "seenAt") {
		t.Fatalf("ai mail = %s", got)
	}
	id := got[strings.Index(got, `"id":"`)+6:]
	id = id[:strings.Index(id, `"`)]
	send(t, "POST", s.URL+"/api/perform", `{"action":"@matomezu/base:mail-seen","args":{"mail":"`+id+`"},"lang":"ja","now":"2026-11-06T00:00:00.000Z"}`, nil)
	if _, got := send(t, "GET", s.URL+"/api/ai/mail", "", ai); !strings.Contains(got, `"seenAt":"2026-11-06T00:00:00.000Z"`) {
		t.Fatalf("ai mail after seen = %s", got)
	}
}

// 効かない郵便（種類が機能台帳に無い）は、消さずに warning（W022）として一覧に持つ
func TestUnknownMailIsAWarning(t *testing.T) {
	store, err := storage.OpenSQLite(filepath.Join(t.TempDir(), "data.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { store.Close() })
	if err := store.PutMailbox(user, json.RawMessage(`[{"id":"m1","mail":"@ex/x:gone","from":"a","sentAt":"t","props":{}}]`)); err != nil {
		t.Fatal(err)
	}
	eng, err := engine.New()
	if err != nil {
		t.Fatal(err)
	}
	h, err := NewHub(store, eng)
	if err != nil {
		t.Fatal(err)
	}
	if got := strings.Join(h.Warnings(), "\n"); !strings.Contains(got, "W022") || !strings.Contains(string(h.Mailbox()), `"m1"`) {
		t.Fatalf("warnings = %s, mailbox = %s", got, h.Mailbox())
	}
}
