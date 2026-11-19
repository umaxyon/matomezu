package server

import (
	"encoding/json"
	"regexp"
	"slices"
	"strings"
	"testing"

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
	if err := again.UnlinkPlugin("a"); err != nil {
		t.Fatal(err)
	}
	if left := documentsOf(t, again); !slices.Equal(left, now) || again.AIFolder("").Lineup[1].Title != "" {
		t.Fatalf("after unlinking = %v %+v", left, again.AIFolder("").Lineup)
	}
}
