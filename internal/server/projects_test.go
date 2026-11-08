package server

import (
	"encoding/json"
	"strings"
	"testing"
)

// list_books と read_mail は、projects のどれかに属するものだけを返す。projects は必須で、空や表に無い id は 400 で断る
func TestAIReadsOnlyTheProjectsItNames(t *testing.T) {
	store := joinStore(t)
	book := func(id, project string) json.RawMessage {
		return json.RawMessage(`{"type":"@matomezu/drawing:drawing","id":"` + id + `","title":"` + id + `","project":"` + project + `","pages":[]}`)
	}
	for id, project := range map[string]string{"a": "default", "b": "elsewhere"} {
		if _, _, err := store.PutBook(id, book(id, project), 0); err != nil {
			t.Fatal(err)
		}
	}
	mail := func(id, project string) string {
		return `{"id":"` + id + `","mail":"@matomezu/base:letter","project":"` + project + `","from":"x","sentAt":"t","props":{"title":"` + id + `","body":""}}`
	}
	if err := store.PutMailbox(user, json.RawMessage(`[`+mail("m1", "default")+`,`+mail("m2", "elsewhere")+`]`)); err != nil {
		t.Fatal(err)
	}
	s, _ := joinWorld(t, store)
	ids := func(path string) string {
		body, _ := call(t, "GET", s.URL+path, "", nil)
		return body
	}
	books := ids("/api/ai/books?projects=default")
	if !strings.Contains(books, `"id":"a"`) || strings.Contains(books, `"id":"b"`) || !strings.Contains(books, `"project":"default"`) {
		t.Fatalf("books of default = %s", books)
	}
	if mails := ids("/api/ai/mail?projects=default"); !strings.Contains(mails, `"id":"m1"`) || strings.Contains(mails, `"id":"m2"`) {
		t.Fatalf("mail of default = %s", mails)
	}
	// 表に無いプロジェクトに属するものは、表に無いプロジェクトを指せないので読めない
	for _, path := range []string{"/api/ai/books", "/api/ai/mail"} {
		for _, q := range []string{"", "?projects=", "?projects=elsewhere", "?projects=default&projects=elsewhere"} {
			body, _ := call(t, "GET", s.URL+path+q, "", nil)
			if strings.Contains(body, `"books"`) || strings.Contains(body, `"mailbox"`) {
				t.Fatalf("%s%s = %s", path, q, body)
			}
		}
	}
}

// 作る物は project を必ず持ち、表に無いプロジェクトでは作らない（book-create・mail-send）
func TestAICreatesInAKnownProject(t *testing.T) {
	s, _ := joinWorld(t, joinStore(t))
	perform := func(body string) string {
		got, _ := call(t, "POST", s.URL+"/api/ai/perform", body, nil)
		return got
	}
	if got := perform(`{"action":"@matomezu/base:book-create","args":{"title":"F","type":"@matomezu/drawing:drawing"}}`); !strings.Contains(got, `"reason":"bad-args"`) {
		t.Fatalf("book-create without project = %s", got)
	}
	if got := perform(`{"action":"@matomezu/base:book-create","args":{"title":"F","project":"nowhere","type":"@matomezu/drawing:drawing"}}`); !strings.Contains(got, `"reason":"refused"`) || !strings.Contains(got, "no such project: nowhere") {
		t.Fatalf("book-create in an unknown project = %s", got)
	}
	if got := perform(`{"action":"@matomezu/base:mail-send","args":{"project":"nowhere","from":"x","title":"y"}}`); !strings.Contains(got, `"reason":"refused"`) {
		t.Fatalf("mail-send in an unknown project = %s", got)
	}
	if got := perform(`{"action":"@matomezu/base:book-create","args":{"title":"F","project":"default","type":"@matomezu/drawing:drawing"}}`); !strings.Contains(got, `"ok":true`) {
		t.Fatalf("book-create = %s", got)
	}
	books, _ := call(t, "GET", s.URL+"/api/ai/books?projects=default", "", nil)
	if !strings.Contains(books, `"title":"F"`) {
		t.Fatalf("books = %s", books)
	}
}
