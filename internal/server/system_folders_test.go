package server

import (
	"encoding/json"
	"io"
	"os"
	"regexp"
	"slices"
	"strconv"
	"strings"
	"testing"

	"github.com/umaxyon/matomezu/internal/engine"
	"github.com/umaxyon/matomezu/internal/storage"
)

// documentsOf は、書庫ホームの直下のシステムフォルダ（起動したときに足すドキュメント）の行の id（並びの順）
func documentsOf(t *testing.T, h *Hub) []string {
	t.Helper()
	ids := []string{}
	for _, e := range h.folders[storage.HomeID].entries {
		var row struct {
			SystemFolder string `json:"systemFolder"`
		}
		if f, ok := h.folders[e]; ok && json.Unmarshal(f.body, &row) == nil && row.SystemFolder != "" {
			ids = append(ids, e)
		}
	}
	return ids
}

// documentsRef は、書庫ホームの並びの先頭に書く、システムフォルダのエントリ（JSON の並びの要素と、後ろの ,）
func documentsRef(t *testing.T, h *Hub) string {
	t.Helper()
	refs := ""
	for _, id := range documentsOf(t, h) {
		refs += `{"kind":"folder","id":"` + id + `"},`
	}
	return refs
}

// systemFolderRow は、/api/data の folders の、システムフォルダの行 1 つ（中身の無い物）
var systemFolderRow = regexp.MustCompile(`\{"id":"([^"]+)","folder":\{"folderRole":"folder","id":"[^"]+","systemFolder":"[^"]+","lineup":\[\]\},"version":\d+\},?`)

// withoutDocuments は、/api/data の答え body から、システムフォルダ（起動したときに足すドキュメント）の行と、書庫ホームの並びのそのエントリを除いた物
func withoutDocuments(body string) string {
	for _, m := range systemFolderRow.FindAllStringSubmatch(body, -1) {
		body = strings.Replace(body, m[0], "", 1)
		ref := `{"kind":"folder","id":"` + m[1] + `"}`
		body = strings.Replace(strings.Replace(body, ref+",", "", 1), ref, "", 1)
	}
	return body
}

// 常駐は起動したとき、書庫ホームの先頭にドキュメントの行を足し（もう在れば足さない）、AI の read_folder には英語の名前と印で見せる。
// 名前の当たる書庫ホームの直下の物には番号を付ける。プラグインが変わったときも足りなければ足す
func TestSystemFoldersAreAddedAtStartAndWhenPluginsChange(t *testing.T) {
	store := libraryStore(t, false)
	putBook(t, store, `{"id":"b9","title":"Documents","lineup":[]}`)
	_, hub := newServerOn(t, Options{}, store)
	docs := documentsOf(t, hub)
	if len(docs) != 1 || hub.folders[storage.HomeID].entries[0] != docs[0] {
		t.Fatalf("system folders %v in home %v", docs, hub.folders[storage.HomeID].entries)
	}
	if b := hub.Book("b9"); b == nil || !strings.Contains(string(b.Body), `"title":"Documents 2"`) {
		t.Fatalf("the book with the same title = %+v", b)
	}
	got := hub.AIFolder("")
	if got == nil || got.Lineup[0].Title != "Documents" || got.Lineup[0].SystemFolder != "@matomezu/base:documents" {
		t.Fatalf("read_folder = %+v", got)
	}
	if inner := hub.AIFolder(docs[0]); inner == nil || inner.Title != "Documents" || inner.SystemFolder != "@matomezu/base:documents" {
		t.Fatalf("read_folder of the documents = %+v", inner)
	}
	// 起動し直しても足さない
	_, again := newServerOn(t, Options{}, store)
	if now := documentsOf(t, again); !slices.Equal(now, docs) {
		t.Fatalf("after a restart = %v; want %v", now, docs)
	}
	// システムフォルダを足す追加プラグインを足すと、その行を印の順の所（@matomezu/base:documents の後）に足す。外しても行は残り、名前は空になる
	dir := pluginDir(t, "a", map[string]string{
		"index.ts": `export default { id: "a", messages: { id: "a:messages", messages: { "a:Extra": { en: "Extra" } } }, ` +
			`systemFolders: [{ id: "a:extra", title: "a:Extra", aiDescription: "x" }] }`,
		"ui.tsx": "export default 1",
	})
	if _, err := again.LinkPlugin(dir); err != nil {
		t.Fatal(err)
	}
	now := documentsOf(t, again)
	if len(now) != 2 || now[0] != docs[0] || again.AIFolder("").Lineup[1].Title != "Extra" {
		t.Fatalf("after linking a plugin = %v %+v", now, again.AIFolder("").Lineup)
	}
	// 利用者の設定で無効にした間は、その行をゴミ箱に入れられる。有効に戻すと、ゴミ箱の外に無いので新しい行を足す（設定のアクションのあと、h.mu を放してから行う）
	set := func(enabled string) {
		t.Helper()
		out, err := again.Perform(performOne("@matomezu/base:settings-set", json.RawMessage(`{"values":{"`+enabledPluginsSetting+`":`+enabled+`}}`), nil))
		if err != nil || !out.OK {
			t.Fatalf("settings-set %s = %+v, %v", enabled, out, err)
		}
	}
	set(`[]`)
	if out, err := again.Perform(performOne("@matomezu/base:entry-trash", json.RawMessage(`{"entry":"`+now[1]+`"}`), nil)); err != nil || !out.OK {
		t.Fatalf("trash the extra folder while its plugin is off = %+v, %v", out, err)
	}
	trashed := now[1]
	set(`["a"]`)
	now = documentsOf(t, again)
	if len(now) != 2 || now[0] != docs[0] || now[1] == trashed || !again.inTrash(trashed) {
		t.Fatalf("after turning the plugin on again = %v (trashed %s)", now, trashed)
	}
	if err := again.UnlinkPlugin("a"); err != nil {
		t.Fatal(err)
	}
	if left := documentsOf(t, again); !slices.Equal(left, now) || again.AIFolder("").Lineup[1].Title != "" {
		t.Fatalf("after unlinking = %v %+v", left, again.AIFolder("").Lineup)
	}
}

// stderrDuring は、do の間に常駐が標準エラーに書いた物
func stderrDuring(t *testing.T, do func()) string {
	t.Helper()
	r, w, err := os.Pipe()
	if err != nil {
		t.Fatal(err)
	}
	was := os.Stderr
	os.Stderr = w
	got := make(chan string)
	go func() {
		b, _ := io.ReadAll(r)
		got <- string(b)
	}()
	defer func() { os.Stderr = was }()
	do()
	w.Close()
	os.Stderr = was
	return <-got
}

// データを書いたあと、書庫のシステムフォルダが機能台帳に合わなくなっていれば、常駐が system-folder-add を行う:
// AI が言語を初めて日本語に選ぶと、利用者の「ドキュメント」に番号が付く。合っていれば、書いたあとにバルクを行わない
func TestSystemFoldersAreKeptAfterWrites(t *testing.T) {
	store := libraryStore(t, false)
	putBook(t, store, `{"id":"b9","title":"ドキュメント","lineup":[]}`)
	s, hub := newServerOn(t, Options{}, store)
	ai := joinedAI(t, s)
	acts := hub.acts
	if out, err := hub.Perform(Perform{Actions: []engine.BulkAction{{Action: "@matomezu/base:book-update", Args: json.RawMessage(`{"title":"x"}`), On: &engine.On{Book: "b1"}}}}); err != nil || !out.OK {
		t.Fatalf("book-update = %+v, %v", out, err)
	}
	if hub.acts != acts+1 {
		t.Fatalf("acts after a write while the system folders are in place = %d; want %d", hub.acts, acts+1)
	}
	if _, got := send(t, "POST", s.URL+"/api/ai/perform", `{"action":"@matomezu/base:settings-set","args":{"values":{"@matomezu/base:lang":"matomezu:ja"}}}`, ai); got != `{"ok":true,"result":{}}` {
		t.Fatalf("the AI chooses Japanese = %s", got)
	}
	if b := hub.Book("b9"); b == nil || !strings.Contains(string(b.Body), `"title":"ドキュメント 2"`) {
		t.Fatalf("the book with the same title after choosing Japanese = %+v", b)
	}
}

// ロック中のブックと名前が当たると、system-folder-add は断られる。同じ答えで断られる間は、書くたびに行い直してもログは 1 回だけ。
// ロックを外したバルクのあとに、番号を付ける
func TestSystemFoldersWaitForTheLockAndLogTheRefusalOnce(t *testing.T) {
	store := libraryStore(t, false)
	putBook(t, store, `{"id":"b9","title":"ドキュメント","lineup":[]}`)
	_, hub := newServerOn(t, Options{}, store)
	do := func(action, args string, on *engine.On) {
		t.Helper()
		if out, err := hub.Perform(Perform{Actions: []engine.BulkAction{{Action: action, Args: json.RawMessage(args), On: on}}}); err != nil || !out.OK {
			t.Fatalf("%s = %+v, %v", action, out, err)
		}
	}
	do("@matomezu/base:book-lock", `{}`, &engine.On{Book: "b9"})
	logged := stderrDuring(t, func() {
		do("@matomezu/base:settings-set", `{"values":{"@matomezu/base:lang":"matomezu:ja"}}`, nil)
		// 書庫ホームの名前が当たっている間は、そこの名前は変えられないので、ほかの物を書く
		do("@matomezu/base:settings-set", `{"values":{"@matomezu/base:skin":"@matomezu/base:dark"}}`, nil)
		do("@matomezu/base:settings-set", `{"values":{"@matomezu/base:skin":"@matomezu/base:light"}}`, nil)
	})
	if n := strings.Count(logged, "system-folder-add could not run"); n != 1 {
		t.Fatalf("the refusals logged %d times; want 1:\n%s", n, logged)
	}
	if n := strings.Count(logged, "refused at the action"); n != 1 {
		t.Fatalf("the refused lines logged %d times; want 1:\n%s", n, logged)
	}
	if b := hub.Book("b9"); b == nil || !strings.Contains(string(b.Body), `"title":"ドキュメント"`) {
		t.Fatalf("the locked book = %+v", b)
	}
	do("@matomezu/base:book-unlock", `{}`, &engine.On{Book: "b9"})
	if b := hub.Book("b9"); b == nil || !strings.Contains(string(b.Body), `"title":"ドキュメント 2"`) {
		t.Fatalf("the book after unlocking = %+v", b)
	}
}

// 読めないブックの名前が、システムフォルダの名前と同じでも、読めない物のフォルダへ移り、書いたあとの確かめは、system-folder-add と同じく数えない
// （行っても何も変わらない system-folder-add を、書くたびに行わない）
func TestTheCheckAfterWritesSkipsUnreadableBooks(t *testing.T) {
	store := libraryStore(t, false)
	folders, err := store.Folders()
	if err != nil {
		t.Fatal(err)
	}
	var home struct {
		Lineup []json.RawMessage `json:"lineup"`
	}
	for _, f := range folders {
		if f.ID == storage.HomeID {
			if err := json.Unmarshal(f.Body, &home); err != nil {
				t.Fatal(err)
			}
		}
	}
	v := versionsOf(t, store)
	if err := store.Apply(storage.Batch{
		Folders: []storage.RowWrite{
			{ID: "bx", Body: json.RawMessage(`{"folderRole":"book","id":"bx","title":"Documents","lineup":[],"locked":"no"}`)},
			{ID: storage.HomeID, Base: v[storage.HomeID], Body: storage.HomeBody(append(home.Lineup, storage.RefOf("book", "bx")))},
		},
		Entries: []storage.EntryPut{{ID: "bx", Folder: storage.HomeID}},
	}); err != nil {
		t.Fatal(err)
	}
	_, hub := newServerOn(t, Options{}, store)
	hub.mu.Lock()
	moved := hub.inUnreadable("bx")
	hub.mu.Unlock()
	if !moved || len(documentsOf(t, hub)) != 1 {
		t.Fatalf("the unreadable book is in the unreadable folder %v, the documents %v", moved, documentsOf(t, hub))
	}
	for i := range 2 {
		acts := hub.acts
		if out, err := hub.Perform(performOne("@matomezu/base:book-update", json.RawMessage(`{"title":"x`+strconv.Itoa(i)+`"}`), &engine.On{Book: "b1"})); err != nil || !out.OK {
			t.Fatalf("book-update = %+v, %v", out, err)
		}
		if hub.acts != acts+1 {
			t.Fatalf("acts after a write = %d; want %d", hub.acts, acts+1)
		}
	}
}
