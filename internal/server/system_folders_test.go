package server

import (
	"encoding/json"
	"io"
	"os"
	"regexp"
	"slices"
	"strings"
	"testing"

	"github.com/umaxyon/matomezu/internal/engine"
	"github.com/umaxyon/matomezu/internal/storage"
)

// documentsOf は、書庫ホームの直下のシステムフォルダ（起動したときに足す base のドキュメントとワークルーム）の行の id（並びの順）
// ticketsHistoryYard は、base の tickets-history のバックヤードの行の id（起動したときに足す。一覧のアクションには、フォルダの全部の後ろに渡す）
const ticketsHistoryYard = "library-backyard-@matomezu/base:tickets-history"

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

// baseSystemFolders は、ビルトインが定義するシステムフォルダの数（base のドキュメントとワークルーム、画像のプラグインの画像）
const baseSystemFolders = 3

// systemFolderRow は、/api/data の folders の、システムフォルダの行 1 つ（中身の無い物）
var systemFolderRow = regexp.MustCompile(`\{"id":"([^"]+)","folder":\{"folderRole":"folder","id":"[^"]+","systemFolder":"[^"]+","lineup":\[\]\},"version":\d+\},?`)

// backyardRow は、/api/data の folders の、バックヤードの行 1 つ（中身の無い物）
var backyardRow = regexp.MustCompile(`\{"id":"[^"]+","folder":\{"folderRole":"backyard","id":"[^"]+","backyard":"[^"]+","lineup":\[\]\},"version":\d+\},?`)

// withoutDocuments は、/api/data の答え body から、起動したときに足す行（システムフォルダのドキュメントと、空のバックヤード）と、書庫ホームの並びのドキュメントのエントリを除いた物
func withoutDocuments(body string) string {
	body = backyardRow.ReplaceAllString(body, "")
	for _, m := range systemFolderRow.FindAllStringSubmatch(body, -1) {
		body = strings.Replace(body, m[0], "", 1)
		ref := `{"kind":"folder","id":"` + m[1] + `"}`
		body = strings.Replace(strings.Replace(body, ref+",", "", 1), ref, "", 1)
	}
	return body
}

// 常駐は起動したとき、書庫を整えて（settleLibrary）書庫ホームの先頭にドキュメントの行を足し（もう在れば足さない）、AI の read_folder には英語の名前と印で見せる。
// 名前の当たる書庫ホームの直下の物には番号を付け、足した物と番号を付けた物をログに書く。プラグインが変わったときも足りなければ足す
func TestSystemFoldersAreAddedAtStartAndWhenPluginsChange(t *testing.T) {
	// os.Stderr を差し替えて常駐の書いた物を読むので、ほかのテストと並べない
	store := libraryStore(t, false)
	putBook(t, store, `{"id":"b9","title":"Documents","lineup":[]}`)
	var hub *Hub
	logged := stderrDuring(t, func() { _, hub = newServerOn(t, Options{}, store) })
	if !strings.Contains(logged, "added the system folder: @matomezu/base:documents") || !strings.Contains(logged, `the title of b9 was taken in its folder; it is now "Documents 2"`) {
		t.Fatalf("the log at start:\n%s", logged)
	}
	docs := documentsOf(t, hub)
	if len(docs) != baseSystemFolders || hub.folders[storage.HomeID].entries[0] != docs[0] {
		t.Fatalf("system folders %v in home %v", docs, hub.folders[storage.HomeID].entries)
	}
	if b := hub.Book("b9"); b == nil || !strings.Contains(string(b.Body), `"title":"Documents 2"`) {
		t.Fatalf("the book with the same title = %+v", b)
	}
	got := hub.AIFolder("", "")
	if got == nil || got.Lineup[0].Title != "Documents" || got.Lineup[0].SystemFolder != "@matomezu/base:documents" {
		t.Fatalf("read_folder = %+v", got)
	}
	if inner := hub.AIFolder(docs[0], ""); inner == nil || inner.Title != "Documents" || inner.SystemFolder != "@matomezu/base:documents" {
		t.Fatalf("read_folder of the documents = %+v", inner)
	}
	// 起動し直しても足さない
	_, again := newServerOn(t, Options{}, store)
	if now := documentsOf(t, again); !slices.Equal(now, docs) {
		t.Fatalf("after a restart = %v; want %v", now, docs)
	}
	// システムフォルダを足す追加プラグインを足すと、その行を印の順の所（@matomezu/base の物の後）に足す。外しても行は残り、名前は空になる
	dir := pluginDir(t, "a", map[string]string{
		"index.ts": `export default { id: "a", messages: { id: "a:messages", messages: { "a:Extra": { en: "Extra" } } }, ` +
			`systemFolders: [{ id: "a:extra", title: "a:Extra", aiDescription: "x" }] }`,
		"ui.tsx": "export default 1",
	})
	if _, err := again.LinkPlugin(dir); err != nil {
		t.Fatal(err)
	}
	now := documentsOf(t, again)
	if len(now) != baseSystemFolders+1 || !slices.Equal(now[:baseSystemFolders], docs) || again.AIFolder("", "").Lineup[baseSystemFolders].Title != "Extra" {
		t.Fatalf("after linking a plugin = %v %+v", now, again.AIFolder("", "").Lineup)
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
	if out, err := again.Perform(performOne("@matomezu/base:entry-trash", json.RawMessage(`{"entry":"`+now[baseSystemFolders]+`"}`), nil)); err != nil || !out.OK {
		t.Fatalf("trash the extra folder while its plugin is off = %+v, %v", out, err)
	}
	trashed := now[baseSystemFolders]
	set(`["a"]`)
	now = documentsOf(t, again)
	if len(now) != baseSystemFolders+1 || !slices.Equal(now[:baseSystemFolders], docs) || now[baseSystemFolders] == trashed || !again.inTrash(trashed) {
		t.Fatalf("after turning the plugin on again = %v (trashed %s)", now, trashed)
	}
	if err := again.UnlinkPlugin("a"); err != nil {
		t.Fatal(err)
	}
	if left := documentsOf(t, again); !slices.Equal(left, now) || again.AIFolder("", "").Lineup[baseSystemFolders].Title != "" {
		t.Fatalf("after unlinking = %v %+v", left, again.AIFolder("", "").Lineup)
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

// AI が言語を初めて日本語に選ぶと、同じバルクで、利用者の「ドキュメント」に番号が付く（ロックの掛かったブックにも。そのあとに別のバルクは行わない）
func TestChoosingTheLanguageFirstNumbersTheTitlesInTheSameBulk(t *testing.T) {
	t.Parallel()
	store := libraryStore(t, false)
	putBook(t, store, `{"id":"b9","title":"ドキュメント","lineup":[]}`)
	s, hub := newServerOn(t, Options{}, store)
	ai := joinedAI(t, s)
	if out, err := hub.Perform(performOne("@matomezu/base:book-lock", json.RawMessage(`{}`), &engine.On{Book: "b9"})); err != nil || !out.OK {
		t.Fatalf("book-lock = %+v, %v", out, err)
	}
	acts := hub.acts
	if _, got := send(t, "POST", s.URL+"/api/ai/perform", `{"action":"@matomezu/base:settings-set","args":{"values":{"@matomezu/base:lang":"matomezu:ja"}}}`, ai); got != `{"ok":true,"result":{}}` {
		t.Fatalf("the AI chooses Japanese = %s", got)
	}
	if b := hub.Book("b9"); b == nil || !strings.Contains(string(b.Body), `"title":"ドキュメント 2"`) {
		t.Fatalf("the book with the same title after choosing Japanese = %+v", b)
	}
	if hub.acts != acts+1 {
		t.Fatalf("acts after choosing the language = %d; want %d", hub.acts, acts+1)
	}
}

// 読めないブックの名前が、システムフォルダの名前と同じでも、読めない物のフォルダへ移り、番号は付かない（読めない物のフォルダの中は名前が重なってよい）
func TestAnUnreadableBookWithTheSystemFolderTitleMovesWithoutANumber(t *testing.T) {
	t.Parallel()
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
	if !moved || len(documentsOf(t, hub)) != baseSystemFolders {
		t.Fatalf("the unreadable book is in the unreadable folder %v, the documents %v", moved, documentsOf(t, hub))
	}
	hub.mu.Lock()
	body := string(hub.folders["bx"].body)
	hub.mu.Unlock()
	if !strings.Contains(body, `"title":"Documents"`) {
		t.Fatalf("the unreadable book = %s", body)
	}
}
