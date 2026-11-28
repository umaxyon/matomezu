package server

import (
	"path/filepath"
	"testing"

	"github.com/umaxyon/matomezu/internal/storage"
)

// 画面の口 page-users: 消すページを使っている所（スクラップで指している見える所のページ）を、書かずに答える。場合分けは base の scrapUsersOf の単体テストが見る
func TestPageUsersTellThePagesWhoseScrapsPointAtThePage(t *testing.T) {
	t.Parallel()
	path := filepath.Join(t.TempDir(), "data.db")
	store, err := storage.OpenSQLite(path)
	if err != nil {
		t.Fatal(err)
	}
	scrap := `{"id":"s","item":"@matomezu/scrap:shape-scrap-box","x":0,"y":0,"props":{"page":"p0","area":{"x":0,"y":0,"w":100,"h":100},"scale":1}}`
	putBook(t, store, `{"id":"f1","title":"Flow","lineup":[`+
		`{"kind":"page","id":"p0","type":"@matomezu/drawing:drawing","title":"P0","paper":"@matomezu/base:a4","orientation":"landscape","items":[]},`+
		`{"kind":"page","id":"p1","type":"@matomezu/drawing:drawing","title":"P1","paper":"@matomezu/base:a4","orientation":"landscape","items":[`+scrap+`]}]}`)
	store.Close()
	s, _ := serveStore(t, path)
	if code, _ := send(t, "POST", s.URL+"/api/page-users", `{"ids":["p0"]}`, map[string]string{"Cookie": ""}); code < 400 {
		t.Fatalf("page-users without the screen cookie = %d", code)
	}
	if code, _ := send(t, "POST", s.URL+"/api/page-users", `{"ids":[]}`, nil); code != 400 {
		t.Fatalf("page-users without ids = %d", code)
	}
	if _, got := send(t, "POST", s.URL+"/api/page-users", `{"ids":["p0","p1"]}`, nil); got != `{"users":{"p0":["p1"]},"sure":true}` {
		t.Fatalf("page-users = %s", got)
	}
}
