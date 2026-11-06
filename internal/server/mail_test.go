package server

import (
	"strings"
	"testing"
)

// AI が手紙を送ると、利用者の郵便箱に 1 通だけ届き、画面の読む口（/api/data）と AI の読む口（/api/ai/mail）に出る。
// 画面から利用者が見たと知らせると、AI の読む口に見た時点が出る（AI に断る所は store のテストが見る）
func TestAISendsMail(t *testing.T) {
	s := newServer(t, nil)
	ai := map[string]string{"Authorization": "Bearer secret"}
	send(t, "POST", s.URL+"/api/ai/perform", `{"action":"@matomezu/base:mail-send","args":{"from":"D64","title":"済みました"}}`, ai)
	_, data := send(t, "GET", s.URL+"/api/data", "", nil)
	if strings.Count(data, `"mail":"@matomezu/base:mail-letter"`) != 1 || !strings.Contains(data, `"props":{"title":"済みました","body":""}`) {
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
