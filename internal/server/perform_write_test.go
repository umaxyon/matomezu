package server

import (
	"encoding/json"
	"errors"
	"path/filepath"
	"slices"
	"strings"
	"testing"

	"github.com/umaxyon/matomezu/internal/engine"
	"github.com/umaxyon/matomezu/internal/storage"
)

// refusing は、fail の間、まとまりの書き込み（Apply）を断る置き場所。applied は書けたまとまりの数
type refusing struct {
	storage.Storage
	fail    bool
	applied int
}

func (r *refusing) Apply(b storage.Batch) error {
	if r.fail {
		return errors.New("refused")
	}
	if err := r.Storage.Apply(b); err != nil {
		return err
	}
	r.applied++
	return nil
}

// bulkHub は、ブック drawing と more を置いた置き場所（書けたまとまりを数える）の Hub と、つないだ窓（hello は読んである）
func bulkHub(t *testing.T, more ...string) (*Hub, *refusing, *client) {
	t.Helper()
	store, err := storage.OpenSQLite(filepath.Join(t.TempDir(), "data.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { store.Close() })
	putBook(t, store, drawing)
	for _, body := range more {
		putBook(t, store, body)
	}
	eng, err := engine.New()
	if err != nil {
		t.Fatal(err)
	}
	r := &refusing{Storage: store}
	hub, err := NewHub(r, eng)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(hub.CloseAll)
	c := hub.Join()
	t.Cleanup(func() { hub.Leave(c) })
	<-c.ch // hello
	r.applied = 0
	return hub, r, c
}

// drained は、窓 c に届いている知らせ（touched を除く）
func drained(c *client) []event {
	got := []event{}
	for {
		select {
		case ev := <-c.ch:
			if ev.name != "touched" {
				got = append(got, ev)
			}
		default:
			return got
		}
	}
}

// step は、アクションバルクの中のアクション 1 つ
func step(action, args string, on *engine.On, ids ...string) engine.BulkAction {
	return engine.BulkAction{Action: action, Args: json.RawMessage(args), On: on, Lang: "ja", IDs: ids}
}

// ページの物を変え、郵便（レコード）を送り、設定を変えるバルクは、1 回の書き込みで、窓への知らせは changed 1 つ（settings・records も載る）と ack
func TestABulkIsOneWriteAndOneChanged(t *testing.T) {
	hub, store, c := bulkHub(t)
	done, err := hub.Perform(Perform{Actions: []engine.BulkAction{
		step("@matomezu/paper:item-place", `{"item":"@matomezu/box:shape-nest-box","at":{"x":1,"y":2}}`, &engine.On{Page: "p1"}, "k1"),
		step("@matomezu/base:mail-send", `{"from":"x","title":"t"}`, nil),
		step("@matomezu/base:settings-set", `{"values":{"@matomezu/base:skin":"@matomezu/base:dark"}}`, nil),
	}, Client: c.id, Seq: 1})
	if err != nil || !done.OK {
		t.Fatalf("perform = %+v, %v", done, err)
	}
	if store.applied != 1 {
		t.Fatalf("writes = %d; want 1", store.applied)
	}
	got := drained(c)
	if len(got) != 2 || got[0].name != "changed" || got[1].name != "ack" || !strings.Contains(string(got[1].data), `"ok":true`) {
		t.Fatalf("events = %v", got)
	}
	var change struct {
		Actions  []string              `json:"actions"`
		Pages    []struct{ ID string } `json:"pages"`
		Settings json.RawMessage       `json:"settings"`
		Records  []struct {
			Subject string `json:"subject"`
		} `json:"records"`
		Client string `json:"client"`
		Seq    int64  `json:"seq"`
	}
	if err := json.Unmarshal(got[0].data, &change); err != nil {
		t.Fatal(err)
	}
	if !slices.Equal(change.Actions, []string{"@matomezu/paper:item-place", "@matomezu/base:mail-send", "@matomezu/base:settings-set"}) ||
		len(change.Pages) != 1 || change.Pages[0].ID != "p1" || !strings.Contains(string(change.Settings), `"@matomezu/base:skin":"@matomezu/base:dark"`) ||
		len(change.Records) != 1 || change.Records[0].Subject != mailKind || change.Client != c.id || change.Seq != 1 {
		t.Fatalf("changed = %s", got[0].data)
	}
}

// バルクの 2 つ目のアクションが断られたら、1 つ目の分も書かず、窓には changed を送らず ack（ok が false）だけ
func TestABulkRefusedAtTheSecondActionChangesNothing(t *testing.T) {
	hub, store, c := bulkHub(t)
	done, err := hub.Perform(Perform{Actions: []engine.BulkAction{
		step("@matomezu/paper:item-place", `{"item":"@matomezu/box:shape-nest-box","at":{"x":1,"y":2}}`, &engine.On{Page: "p1"}, "k1"),
		step("@matomezu/paper:item-update", `{"item":"gone","props":{}}`, &engine.On{Page: "p1"}),
	}, Client: c.id, Seq: 1})
	if err != nil || done.OK {
		t.Fatalf("perform = %+v, %v", done, err)
	}
	if store.applied != 0 || hub.PageVersion("p1") != 1 {
		t.Fatalf("writes = %d, the page's version = %d", store.applied, hub.PageVersion("p1"))
	}
	if got := drained(c); len(got) != 1 || got[0].name != "ack" || !strings.Contains(string(got[0].data), `"ok":false`) {
		t.Fatalf("events = %v", got)
	}
}

// 同じ番号（Key）のバルクは二度行わない: 前の結果を返し、書かず、ack だけを送る
func TestABulkKeyIsPerformedOnce(t *testing.T) {
	hub, store, c := bulkHub(t)
	bulk := Perform{Actions: []engine.BulkAction{
		step("@matomezu/paper:item-place", `{"item":"@matomezu/box:shape-nest-box","at":{"x":1,"y":2}}`, &engine.On{Page: "p1"}, "k1"),
		step("@matomezu/paper:item-place", `{"item":"@matomezu/box:shape-nest-box","at":{"x":100,"y":2}}`, &engine.On{Page: "p1"}, "k2"),
	}, Client: c.id, Seq: 1, Key: "x1"}
	first, err := hub.Perform(bulk)
	if err != nil || !first.OK {
		t.Fatalf("perform = %+v, %v", first, err)
	}
	drained(c)
	again, err := hub.Perform(bulk)
	if err != nil || string(again.Result) != string(first.Result) || store.applied != 1 || hub.PageVersion("p1") != 2 {
		t.Fatalf("again = %+v, %v; writes = %d", again, err, store.applied)
	}
	if got := drained(c); len(got) != 1 || got[0].name != "ack" {
		t.Fatalf("events = %v", got)
	}
}

// 前のアクションが足したページを宛先にしたアクションも通る（置き場所に無いページが宛先なら、エンジンに全部のブックを渡す）
func TestABulkActsOnAPageItAdded(t *testing.T) {
	hub, _, c := bulkHub(t)
	done, err := hub.Perform(Perform{Actions: []engine.BulkAction{
		step("@matomezu/base:page-add", `{"type":"@matomezu/drawing:drawing","title":"追加"}`, &engine.On{Book: "b1"}, "p2"),
		step("@matomezu/paper:item-place", `{"item":"@matomezu/box:shape-nest-box","at":{"x":1,"y":2}}`, &engine.On{Page: "p2"}, "k1"),
	}, Client: c.id, Seq: 1})
	if err != nil || !done.OK {
		t.Fatalf("perform = %+v, %v", done, err)
	}
	pages, _ := hub.Tables()
	added := ""
	for _, p := range pages {
		if p.ID == "p2" {
			added = string(p.Body)
		}
	}
	if !strings.Contains(added, `"id":"k1"`) {
		t.Fatalf("the added page = %s", added)
	}
}

// AI 編集チケットの変え方は、それを返したアクションの対象の種類の中で Key を見分ける: 種類の違う 2 つの変え方が、それぞれの種類の物に当たる
func TestAIEditTicketChangesMatchTheirOwnSubject(t *testing.T) {
	hub, _, _ := bulkHub(t)
	hub.mu.Lock()
	defer hub.mu.Unlock()
	hub.aiEditTickets = []AIEditTicket{{Key: "k", Subject: "ex:a", Book: "b1", At: "t0"}, {Key: "k", Subject: "ex:b", Book: "b1", At: "t0"}}
	plan, err := hub.planWrites(engine.Output{OK: true, AIEditTickets: []engine.AIEditTicketChange{
		{Subject: "ex:b", Book: "b1", Key: "k", Outcome: "failed", Changed: []string{"x"}},
		{Subject: "ex:a", Book: "b1", Key: "k", Outcome: "closed"},
	}}, "window", "", "t1")
	if err != nil || plan == nil || plan.tickets == nil {
		t.Fatalf("plan = %+v, %v", plan, err)
	}
	if got := *plan.tickets; len(got) != 1 || got[0].Subject != "ex:b" || !got[0].Failed || !slices.Equal(got[0].Changed, []string{"x"}) {
		t.Fatalf("tickets = %+v", got)
	}
}

// 置き場所が書けなかった Perform は、エラーを返して何も変えない（メモリも窓への知らせも）。同じ番号（Key）で行い直すと、行われる
func TestPerformChangesNothingWhenTheWriteFails(t *testing.T) {
	store, err := storage.OpenSQLite(filepath.Join(t.TempDir(), "data.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { store.Close() })
	putBook(t, store, drawing)
	eng, err := engine.New()
	if err != nil {
		t.Fatal(err)
	}
	r := &refusing{Storage: store, fail: true}
	hub, err := NewHub(r, eng)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(hub.CloseAll)
	c := hub.Join()
	defer hub.Leave(c)
	<-c.ch // hello

	do := func() (Performed, error) {
		return hub.Perform(Perform{Actions: []engine.BulkAction{{Action: "@matomezu/base:page-add", Args: json.RawMessage(`{"type":"@matomezu/drawing:drawing","title":"追加"}`), On: &engine.On{Book: "b1"}}}, Client: c.id, Seq: 1, Key: "k1"})
	}
	if _, err := do(); err == nil || !strings.Contains(err.Error(), "refused") {
		t.Fatalf("perform = %v; want the refused error", err)
	}
	entries := func() int {
		got, err := store.Entries()
		if err != nil {
			t.Fatal(err)
		}
		return len(got)
	}
	pages, folders := hub.Tables()
	if len(pages) != 1 || pages[0].Version != 1 || len(folders) != 4 || folders[0].Version != 1 || strings.Contains(string(folders[0].Body), "追加") || entries() != 2 {
		t.Fatalf("the book changed: %+v %+v", pages, folders)
	}
	if book := hub.Book("b1"); book == nil || book.Version != 1 || strings.Contains(string(book.Body), "追加") {
		t.Fatalf("the assembled book changed: %+v", book)
	}
	select {
	case ev := <-c.ch:
		t.Fatalf("a window was told something: %s", ev.name)
	default:
	}
	r.fail = false
	done, err := do()
	if err != nil || !done.OK {
		t.Fatalf("perform again = %+v, %v", done, err)
	}
	// 起動したときに書けなかったシステムフォルダ（ドキュメント）も、書けたあとの確かめで足す（フォルダとエントリが 1 つずつ増える）
	pages, folders = hub.Tables()
	b1 := slices.IndexFunc(folders, func(f storage.Folder) bool { return f.ID == "b1" })
	if len(pages) != 2 || len(folders) != 5 || b1 < 0 || folders[b1].Version != 2 || entries() != 4 || len(documentsOf(t, hub)) != 1 {
		t.Fatalf("the book did not change: %+v %+v", pages, folders)
	}
	if book := hub.Book("b1"); book == nil || book.Version != 2 || !strings.Contains(string(book.Body), "追加") {
		t.Fatalf("the assembled book did not change: %+v", book)
	}
	if ev := <-c.ch; ev.name != "changed" {
		t.Fatalf("the window was told %s; want changed", ev.name)
	}
}

// 2 冊のブックを置き直す book-revert（画面の戻す・やり直す）は 1 回の書き込み: 片方のブックを認可ステップが止めたら、どちらのブックも変わらない。
// 止められなければ、2 冊とも変わり、窓への知らせは 1 つ
func TestRevertOfTwoBooksIsOneWrite(t *testing.T) {
	store, err := storage.OpenSQLite(filepath.Join(t.TempDir(), "data.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { store.Close() })
	putBook(t, store, drawing)
	putBook(t, store, `{"id":"b2","title":"U","lineup":[{"kind":"page","id":"p2","type":"@matomezu/drawing:drawing","title":"Q","paper":"@matomezu/base:a4","orientation":"landscape"}]}`)
	eng, err := engine.New()
	if err != nil {
		t.Fatal(err)
	}
	hub, err := NewHub(store, eng)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(hub.CloseAll)
	c := hub.Join()
	defer hub.Leave(c)
	<-c.ch // hello

	seq := int64(0)
	do := func(action, args string, on *engine.On) Performed {
		t.Helper()
		seq++
		done, err := hub.Perform(Perform{Actions: []engine.BulkAction{{Action: action, Args: json.RawMessage(args), On: on}}, Client: c.id, Seq: seq})
		if err != nil {
			t.Fatal(err)
		}
		return done
	}
	titles := func() string {
		return titleOf(t, hub, "b1") + " " + titleOf(t, hub, "b2")
	}
	drain := func() []string {
		names := []string{}
		for {
			select {
			case ev := <-c.ch:
				names = append(names, ev.name)
			default:
				return names
			}
		}
	}
	revert := `{"books":["b1","b2"],"pages":{},"folders":{"b1":{"fields":{"title":{"set":"T2","was":"T"}}},"b2":{"fields":{"title":{"set":"U2","was":"U"}}}}}`
	if done := do("@matomezu/base:book-lock", `{}`, &engine.On{Book: "b2"}); !done.OK {
		t.Fatalf("lock = %+v", done)
	}
	drain()
	if done := do("@matomezu/base:book-revert", revert, nil); done.OK || done.Reason != "denied" {
		t.Fatalf("revert of a locked book = %+v; want denied", done)
	}
	if got := titles(); got != "T U" {
		t.Fatalf("titles = %q; want nothing changed", got)
	}
	if names := drain(); slices.Contains(names, "changed") {
		t.Fatalf("a window was told %v", names)
	}
	if done := do("@matomezu/base:book-unlock", `{}`, &engine.On{Book: "b2"}); !done.OK {
		t.Fatalf("unlock = %+v", done)
	}
	drain()
	if done := do("@matomezu/base:book-revert", revert, nil); !done.OK {
		t.Fatalf("revert = %+v", done)
	}
	if got := titles(); got != "T2 U2" {
		t.Fatalf("titles = %q; want both changed", got)
	}
	changed := 0
	for _, name := range drain() {
		if name == "changed" {
			changed++
		}
	}
	if changed != 1 {
		t.Fatalf("changed notices = %d; want 1", changed)
	}
}

// titleOf は、ブック id の名前
func titleOf(t *testing.T, hub *Hub, id string) string {
	t.Helper()
	book := hub.Book(id)
	if book == nil {
		t.Fatalf("no book %s", id)
	}
	var head struct {
		Title string `json:"title"`
	}
	if err := json.Unmarshal(book.Body, &head); err != nil {
		t.Fatal(err)
	}
	return head.Title
}

// 前のアクションが作ったレコードを宛先にしたアクションも通り、同じレコードの変更は 1 つにまとまって 1 回で書かれる
func TestABulkActsOnARecordItAdded(t *testing.T) {
	hub, store, c := bulkHub(t)
	records, _ := hub.Records()
	project := ""
	for id := range records["@matomezu/taskboard:project"] {
		project = id
	}
	done, err := hub.Perform(Perform{Actions: []engine.BulkAction{
		step("@matomezu/taskboard:ticket-add", `{"project":"`+project+`","name":"widget"}`, nil, "t1"),
		step("@matomezu/taskboard:ticket-complete", `{}`, &engine.On{Record: "t1"}, "h1"),
	}, Client: c.id, Seq: 1})
	if err != nil || !done.OK || store.applied != 1 {
		t.Fatalf("perform = %+v, %v; writes = %d", done, err, store.applied)
	}
	got := drained(c)
	if len(got) != 2 || got[0].name != "changed" || strings.Count(string(got[0].data), `"id":"t1","record"`) != 1 {
		t.Fatalf("events = %v", got)
	}
}

// エンジンへ渡すブックは、アクションごとの宛先のブックの和（その後ろに、ブックから書庫ホームまでのフォルダ）。置き場所に無いページが宛先なら全部のブックと、書庫ホーム・ゴミ箱・フォルダの全部。宛先のレコードも和
func TestBulkInputsAreTheUnionOfTheActions(t *testing.T) {
	const other = `{"id":"b2","title":"U","lineup":[{"kind":"page","id":"p2","type":"@matomezu/drawing:drawing","title":"Q","paper":"@matomezu/base:a4","orientation":"landscape"}]}`
	hub, _, _ := bulkHub(t, other)
	hub.mu.Lock()
	defer hub.mu.Unlock()
	update := func(page string) engine.BulkAction {
		return step("@matomezu/base:page-update", `{"title":"x"}`, &engine.On{Page: page})
	}
	folders := func(steps ...engine.BulkAction) []string {
		t.Helper()
		in := engine.Input{Actions: steps}
		if err := hub.performInputs(&in); err != nil {
			t.Fatal(err)
		}
		ids := []string{}
		for _, f := range in.Folders {
			var head struct{ ID string }
			_ = json.Unmarshal(f, &head)
			ids = append(ids, head.ID)
		}
		return ids
	}
	if got := folders(update("p1")); !slices.Equal(got, []string{"b1", storage.HomeID}) {
		t.Fatalf("one page = %v", got)
	}
	if got := folders(update("p2"), update("p1")); !slices.Equal(got, []string{"b2", "b1", storage.HomeID}) {
		t.Fatalf("two pages = %v", got)
	}
	added := step("@matomezu/base:page-add", `{"type":"@matomezu/drawing:drawing","title":"追加"}`, &engine.On{Book: "b1"}, "p3")
	if got := folders(added, update("p3")); !slices.Equal(got, append([]string{"b1", "b2", storage.HomeID, storage.TrashID}, documentsOf(t, hub)...)) {
		t.Fatalf("a page the bulk adds = %v", got)
	}
	if got := folders(update("p9"), update("p1")); !slices.Equal(got, []string{"b1", storage.HomeID}) {
		t.Fatalf("a page that is nowhere, at the first action = %v", got)
	}
	hub.recordTables[mailKind] = map[string]recordEntry{"m1": {json.RawMessage(`{"id":"m1"}`), 1}, "m2": {json.RawMessage(`{"id":"m2"}`), 1}}
	in := engine.Input{Actions: []engine.BulkAction{
		step("@matomezu/base:mail-seen", `{}`, &engine.On{Record: "m1"}),
		step("@matomezu/base:mail-seen", `{}`, &engine.On{Record: "m2"}),
	}}
	if err := hub.performInputs(&in); err != nil {
		t.Fatal(err)
	}
	if len(in.Records[mailKind]) != 2 || in.Records[mailKind]["m1"] == nil || in.Records[mailKind]["m2"] == nil {
		t.Fatalf("records = %v", in.Records)
	}
}

// ゴミ箱のブックのページを宛先にしたアクションは、それだけのバルクでも、宛先の無いアクションと混ぜたバルクでも、同じ no-page で断られ、何も書かれない
func TestABulkOnATrashedPageIsRefusedAlike(t *testing.T) {
	hub, store, c := bulkHub(t)
	if done, err := hub.Perform(Perform{Actions: []engine.BulkAction{step("@matomezu/base:entry-trash", `{"entry":"b1"}`, nil)}}); err != nil || !done.OK {
		t.Fatalf("entry-trash = %+v, %v", done, err)
	}
	drained(c)
	store.applied = 0
	update := step("@matomezu/base:page-update", `{"title":"x"}`, &engine.On{Page: "p1"})
	settings := step("@matomezu/base:settings-set", `{"values":{"@matomezu/base:skin":"@matomezu/base:dark"}}`, nil)
	for name, actions := range map[string][]engine.BulkAction{"alone": {update}, "after settings-set": {settings, update}} {
		done, err := hub.Perform(Perform{Actions: actions, Client: c.id, Seq: 1})
		if err != nil || done.OK || done.Reason != "no-page" {
			t.Errorf("%s = %+v, %v; want no-page", name, done, err)
		}
		if got := drained(c); len(got) != 1 || got[0].name != "ack" {
			t.Errorf("%s: events = %v", name, got)
		}
	}
	if store.applied != 0 {
		t.Fatalf("writes = %d; want 0", store.applied)
	}
}

// エンジンの返した物に、同じページ・フォルダ・レコードが 2 つあれば、書く前に、それを名指す error で止める
func TestPlanWritesStopsOnARepeatedChange(t *testing.T) {
	hub, _, _ := bulkHub(t)
	hub.mu.Lock()
	defer hub.mu.Unlock()
	row := json.RawMessage(`{}`)
	cases := map[string]engine.Output{
		"pages p1":       {OK: true, Pages: []engine.RowChange{{ID: "p1", Row: row}, {ID: "p1", Row: row}}},
		"folders b1":     {OK: true, Folders: []engine.RowChange{{ID: "b1", Row: row}, {ID: "b1", Removed: true}}},
		"record ex:a r1": {OK: true, Records: []engine.RecordChange{{Subject: "ex:a", ID: "r1", Record: row}, {Subject: "ex:a", ID: "r1", Record: row}}},
	}
	for want, out := range cases {
		if plan, err := hub.planWrites(out, "window", "", "t"); err == nil || plan != nil || !strings.Contains(err.Error(), want) {
			t.Errorf("%s: plan = %v, %v", want, plan, err)
		}
	}
	// 種類の違う同じ id は別のレコード
	other := engine.Output{OK: true, Records: []engine.RecordChange{{Subject: "ex:a", ID: "r1", Record: row}, {Subject: "ex:b", ID: "r1", Record: row}}}
	if _, err := hub.planWrites(other, "window", "", "t"); err != nil {
		t.Fatalf("two subjects = %v", err)
	}
}
