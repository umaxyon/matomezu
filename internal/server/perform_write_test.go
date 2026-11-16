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

// refusing は、fail の間、まとまりの書き込み（Apply）を断る置き場所
type refusing struct {
	storage.Storage
	fail bool
}

func (r *refusing) Apply(b storage.Batch) error {
	if r.fail {
		return errors.New("refused")
	}
	return r.Storage.Apply(b)
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
		return hub.Perform(Perform{Action: "@matomezu/base:page-add", Args: json.RawMessage(`{"type":"@matomezu/drawing:drawing","title":"追加"}`), On: &engine.On{Book: "b1"}, Client: c.id, Seq: 1, Key: "k1"})
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
	if len(pages) != 1 || pages[0].Version != 1 || len(folders) != 1 || folders[0].Version != 1 || strings.Contains(string(folders[0].Body), "追加") || entries() != 1 {
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
	pages, folders = hub.Tables()
	if len(pages) != 2 || len(folders) != 1 || folders[0].Version != 2 || entries() != 2 {
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
		done, err := hub.Perform(Perform{Action: action, Args: json.RawMessage(args), On: on, Client: c.id, Seq: seq})
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
	revert := `{"books":["b1","b2"],"pages":{},"folders":{"b1":{"fields":{"title":{"set":"T2"}}},"b2":{"fields":{"title":{"set":"U2"}}}}}`
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
