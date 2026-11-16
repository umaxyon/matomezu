package server

import (
	"encoding/json"
	"fmt"
	"path/filepath"
	"strings"
	"testing"

	"github.com/umaxyon/matomezu/internal/engine"
	"github.com/umaxyon/matomezu/internal/storage"
)

// mailRecords は、AI が郵便を読む口（read_records の郵便の種類）
const mailRecords = "/api/ai/records?kind=%40matomezu%2Fbase%3Amail"

// AI が手紙を送ると、利用者の郵便箱に 1 通だけ届き、画面の読む口（/api/data）と AI の読む口（read_records の郵便の種類）に出る。
// 画面から利用者が見たと知らせると、AI の読む口に見た時点が出る（AI に断る所は store のテストが見る）
func TestAISendsMail(t *testing.T) {
	s := newServer(t, nil)
	ai := joinedAI(t, s)
	send(t, "POST", s.URL+"/api/ai/perform", `{"action":"@matomezu/base:mail-send","args":{"from":"D64","title":"済みました"}}`, ai)
	_, data := send(t, "GET", s.URL+"/api/data", "", nil)
	if strings.Count(data, `"mail":"@matomezu/base:letter"`) != 1 || !strings.Contains(data, `"props":{"title":"済みました","body":""}`) {
		t.Fatalf("data = %s", data)
	}
	_, got := send(t, "GET", s.URL+mailRecords, "", ai)
	if !strings.Contains(got, `"from":"D64"`) || strings.Contains(got, "seenAt") {
		t.Fatalf("ai mail = %s", got)
	}
	id := got[strings.Index(got, `"id":"`)+6:]
	id = id[:strings.Index(id, `"`)]
	send(t, "POST", s.URL+"/api/perform", `{"action":"@matomezu/base:mail-seen","args":{},"on":{"record":"`+id+`"},"lang":"ja","now":"2026-11-06T00:00:00.000Z"}`, nil)
	if _, got := send(t, "GET", s.URL+mailRecords, "", ai); !strings.Contains(got, `"seenAt":"2026-11-06T00:00:00.000Z"`) {
		t.Fatalf("ai mail after seen = %s", got)
	}
}

// AI の読む口は、一覧（中身を外して題を付け、total と older を添える）と、指した郵便の全文を、取り方の問い合わせで返し、合わない取り方は 400 で断る（取り方の細かな境界は core のテストが見る）
func TestAIMailQuery(t *testing.T) {
	s := newServer(t, nil)
	ai := joinedAI(t, s)
	for _, title := range []string{"一", "二", "三"} {
		send(t, "POST", s.URL+"/api/ai/perform", `{"action":"@matomezu/base:mail-send","args":{"from":"D89","title":"`+title+`","body":"本文"}}`, ai)
	}
	_, list := send(t, "GET", s.URL+mailRecords+"&limit=2", "", ai)
	if strings.Contains(list, `"props"`) || !strings.Contains(list, `"brief":"三"`) || !strings.Contains(list, `"brief":"二"`) || strings.Contains(list, `"brief":"一"`) ||
		!strings.Contains(list, `"total":4`) || !strings.Contains(list, `"older":2`) {
		t.Fatalf("list = %s", list)
	}
	id := list[strings.LastIndex(list, `"id":"`)+6:]
	id = id[:strings.Index(id, `"`)]
	_, older := send(t, "GET", s.URL+mailRecords+"&before="+id, "", ai)
	if !strings.Contains(older, `"brief":"一"`) || strings.Contains(older, `"brief":"二"`) {
		t.Fatalf("before = %s", older)
	}
	_, full := send(t, "GET", s.URL+mailRecords+"&ids="+id+"&ids=nothing", "", ai)
	if !strings.Contains(full, `"props":{"title":"二","body":"本文"}`) || !strings.Contains(full, `"unknown":["nothing"]`) {
		t.Fatalf("ids = %s", full)
	}
	for _, bad := range []string{"limit=0", "before=nothing", "ids=x&limit=1", "where.title=x", "is.seenAt=maybe", "where.order=x"} {
		if code, _ := send(t, "GET", s.URL+mailRecords+"&"+bad, "", ai); code != 400 {
			t.Fatalf("%s = %d", bad, code)
		}
	}
	// 利用者が開いていない郵便だけ（見た時点が無い）と、届いた順の番号で 1 通
	send(t, "POST", s.URL+"/api/perform", `{"action":"@matomezu/base:mail-seen","args":{},"on":{"record":"`+id+`"},"lang":"ja","now":"2026-11-06T00:00:00.000Z"}`, nil)
	if _, unseen := send(t, "GET", s.URL+mailRecords+"&is.seenAt=absent", "", ai); strings.Contains(unseen, `"brief":"二"`) || !strings.Contains(unseen, `"brief":"三"`) || !strings.Contains(unseen, `"total":3`) {
		t.Fatalf("unseen = %s", unseen)
	}
	if _, seen := send(t, "GET", s.URL+mailRecords+"&is.seenAt=present", "", ai); !strings.Contains(seen, `"brief":"二"`) || !strings.Contains(seen, `"total":1`) {
		t.Fatalf("seen = %s", seen)
	}
}

// 効かない郵便（種類が機能台帳に無い）は、消さずに warning（W022）として一覧に持つ
func TestUnknownMailIsAWarning(t *testing.T) {
	store, err := storage.OpenSQLite(filepath.Join(t.TempDir(), "data.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { store.Close() })
	if _, err := store.Apply(storage.Batch{Records: []storage.RecordWrite{{Subject: mailKind, ID: "m1", Body: json.RawMessage(`{"id":"m1","mail":"@ex/x:gone","from":"a","sentAt":"t","props":{},"order":1}`)}}}); err != nil {
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
	records, _ := h.Records()
	if got := strings.Join(h.Warnings(), "\n"); !strings.Contains(got, "W022") || !strings.Contains(got, "mail m1") || records[mailKind]["m1"] == nil {
		t.Fatalf("warnings = %s, records = %v", got, records)
	}
	// 書くたびに確かめ直すのは変えたレコードだけ。ほかの郵便が届いても、m1 の warning は残る
	if done, err := h.Perform(Perform{Action: "@matomezu/base:mail-send", Args: json.RawMessage(`{"from":"x","title":"t"}`)}); err != nil || !done.OK {
		t.Fatalf("mail-send = %+v, %v", done, err)
	}
	if got := strings.Join(h.Warnings(), "\n"); strings.Count(got, "W022") != 1 || !strings.Contains(got, "mail m1") {
		t.Fatalf("warnings after a new letter = %s", got)
	}
}

// 郵便箱が上限（200 通）なら、1 通足すアクションは、既読の古い郵便を消すのと一緒に 1 つのトランザクションで書き、
// 窓には 1 つの record の知らせ（足した郵便と消した郵便、進めた番号、最後にフォーカスされた窓）で送る
func TestMailLimitDropsTheOldestInOneAction(t *testing.T) {
	store, err := storage.OpenSQLite(filepath.Join(t.TempDir(), "data.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { store.Close() })
	batch := storage.Batch{Counters: []storage.Counter{{Subject: mailKind, Scope: "mail", Next: 201}}}
	for i := 1; i <= 200; i++ {
		id := fmt.Sprintf("m%03d", i)
		seen := `,"seenAt":"2026-11-01T00:00:00.000Z"`
		if i == 1 {
			seen = "" // 未読の郵便は、既読の郵便より後に消す
		}
		body := fmt.Sprintf(`{"id":%q,"mail":"@matomezu/base:letter","from":"a","sentAt":"2026-11-01T00:00:00.000Z"%s,"props":{"title":"%d","body":""},"order":%d}`, id, seen, i, i)
		batch.Records = append(batch.Records, storage.RecordWrite{Subject: mailKind, ID: id, Body: json.RawMessage(body)})
	}
	if _, err := store.Apply(batch); err != nil {
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
	c := h.Join()
	<-c.ch // hello
	h.SetView(c.id, json.RawMessage(window), nil, nil, true, 1)
	done, err := h.Perform(Perform{Action: "@matomezu/base:mail-send", Args: json.RawMessage(`{"from":"x","title":"new"}`), Client: c.id, Seq: 1})
	var sent struct{ Mail string }
	if err != nil || !done.OK || json.Unmarshal(done.Result, &sent) != nil || sent.Mail == "" {
		t.Fatalf("mail-send = %+v, %v", done, err)
	}
	var got []event
	for e := range c.ch {
		if e.name == "touched" {
			continue
		}
		got = append(got, e)
		if e.name == "ack" {
			break
		}
	}
	if len(got) != 2 || got[0].name != "record" {
		t.Fatalf("events = %v", got)
	}
	var change struct {
		Records []struct {
			Subject string          `json:"subject"`
			ID      string          `json:"id"`
			Record  json.RawMessage `json:"record"`
			Version int64           `json:"version"`
		} `json:"records"`
		Counters map[string]map[string]int64 `json:"counters"`
		Window   string                      `json:"window"`
		Client   string                      `json:"client"`
		Seq      int64                       `json:"seq"`
	}
	if err := json.Unmarshal(got[0].data, &change); err != nil {
		t.Fatal(err)
	}
	if len(change.Records) != 2 || change.Records[0].ID != sent.Mail || change.Records[0].Version != 1 || !strings.Contains(string(change.Records[0].Record), `"order":201`) ||
		change.Records[1].ID != "m002" || string(change.Records[1].Record) != `"removed"` || change.Records[1].Version != 0 ||
		change.Counters[mailKind]["mail"] != 202 || change.Window != c.id || change.Client != c.id || change.Seq != 1 {
		t.Fatalf("record event = %s", got[0].data)
	}
	records, counters := h.Records()
	if len(records[mailKind]) != 200 || records[mailKind]["m002"] != nil || records[mailKind]["m001"] == nil || records[mailKind][sent.Mail] == nil || counters[mailKind]["mail"] != 202 {
		t.Fatalf("mail = %d letters, counters = %v", len(records[mailKind]), counters)
	}
	stored, err := store.Records()
	if err != nil {
		t.Fatal(err)
	}
	n := 0
	for _, r := range stored {
		if r.Subject == mailKind {
			n++
		}
	}
	if n != 200 {
		t.Fatalf("stored letters = %d", n)
	}
}

// 種類と key で引くので、別の種類の同じ key の AI 編集チケットは閉じない。種類を持たないチケットは key だけで合う
func TestAIEditTicketsAreFoundBySubjectAndKey(t *testing.T) {
	list, _ := changedTickets(nil, mailKind, engine.AIEditTicketChange{Book: "b1", Key: "k", Outcome: "open"}, 1, "t")
	if len(list) != 1 || list[0].Subject != mailKind {
		t.Fatalf("opened = %+v", list)
	}
	if _, changed := changedTickets(list, "ex:other", engine.AIEditTicketChange{Book: "b1", Key: "k", Outcome: "closed"}, 1, "t"); changed {
		t.Fatal("a ticket of another subject was closed")
	}
	if left, changed := changedTickets(list, mailKind, engine.AIEditTicketChange{Book: "b1", Key: "k", Outcome: "closed"}, 1, "t"); !changed || len(left) != 0 {
		t.Fatalf("closed = %+v, %v", left, changed)
	}
	old := []AIEditTicket{{Key: "k", At: "t", Version: 1}}
	if left, changed := changedTickets(old, mailKind, engine.AIEditTicketChange{Book: "b1", Key: "k", Outcome: "closed"}, 1, "t"); !changed || len(left) != 0 {
		t.Fatalf("closed without a subject = %+v, %v", left, changed)
	}
}

// 郵便箱が上限のとき、変更提案郵便を送ると、新しい提案の AI 編集チケットを開くのと、上限で消えた反映していない提案の AI 編集チケットを
// 消えたと記す（cause limit）のを、郵便のレコードと一緒に 1 回の書き込みで行う
func TestProposalSendOpensAndRemovesTicketsInOneWrite(t *testing.T) {
	store, err := storage.OpenSQLite(filepath.Join(t.TempDir(), "data.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { store.Close() })
	batch := storage.Batch{
		Books:         []storage.BookWrite{{ID: "b1", Body: json.RawMessage(boxed)}},
		Counters:      []storage.Counter{{Subject: mailKind, Scope: "mail", Next: 201}},
		AIEditTickets: []storage.BookBody{{Book: "b1", Body: json.RawMessage(`[{"key":"m001","subject":"` + mailKind + `","at":"t","version":1}]`)}},
	}
	for i := 1; i <= 200; i++ {
		id := fmt.Sprintf("m%03d", i)
		body := fmt.Sprintf(`{"id":%q,"mail":"@matomezu/base:letter","from":"a","sentAt":"t","props":{"title":"%d","body":""},"order":%d}`, id, i, i)
		if i == 1 {
			// 見た郵便は先に消える
			body = `{"id":"m001","mail":"@matomezu/base:proposal","from":"a","sentAt":"t","seenAt":"t","props":{"title":"提案","body":"","book":"b1","changes":[{"action":"x","args":{}}],"snapshot":{}},"order":1}`
		}
		batch.Records = append(batch.Records, storage.RecordWrite{Subject: mailKind, ID: id, Body: json.RawMessage(body)})
	}
	if _, err := store.Apply(batch); err != nil {
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
	change := `[{"action":"@matomezu/paper:item-update","args":{"item":"a","props":{"caption":"AI"}},"on":{"page":"p1"}}]`
	done, err := h.Perform(Perform{Action: "@matomezu/base:proposal-send", Args: json.RawMessage(`{"from":"E94","title":"名前","book":"b1","page":"p1","changes":` + change + `}`)})
	var sent struct{ Mail string }
	if err != nil || !done.OK || json.Unmarshal(done.Result, &sent) != nil || sent.Mail == "" {
		t.Fatalf("proposal-send = %+v, %v", done, err)
	}
	want := fmt.Sprintf(`[{"key":"m001","subject":%q,"at":"t","version":1,"removed":"limit"},{"key":%q,"subject":%q,"at":`, mailKind, sent.Mail, mailKind)
	stored, err := store.AIEditTickets()
	if err != nil || !strings.HasPrefix(string(stored["b1"]), want) {
		t.Fatalf("stored tickets = %s, %v; want %s…", stored["b1"], err, want)
	}
	h.mu.Lock()
	list := h.aiEditTickets["b1"]
	h.mu.Unlock()
	if len(list) != 2 || list[0].Removed != "limit" || list[1].Key != sent.Mail || list[1].Removed != "" {
		t.Fatalf("tickets = %+v", list)
	}
	if records, _ := h.Records(); records[mailKind]["m001"] != nil {
		t.Fatal("the proposal over the limit is still there")
	}
}
