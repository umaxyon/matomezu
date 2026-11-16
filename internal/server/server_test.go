package server

import (
	"bufio"
	"encoding/json"
	"fmt"
	"io"
	"maps"
	"net"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"slices"
	"strconv"
	"strings"
	"sync"
	"testing"
	"testing/fstest"
	"time"

	"github.com/umaxyon/matomezu/internal/engine"
	"github.com/umaxyon/matomezu/internal/storage"
)

// bookBatch は、ブックの本文 body（並びにページとバインダの中身ごと持つ形）を分けて置く書き込み
func bookBatch(t *testing.T, body string) storage.Batch {
	t.Helper()
	split, ok := storage.SplitBook(json.RawMessage(body), map[string]bool{})
	if !ok {
		t.Fatalf("the book cannot be split: %s", body)
	}
	var b storage.Batch
	for _, p := range split.Pages {
		b.Pages = append(b.Pages, storage.RowWrite{ID: p.ID, Body: p.Body})
	}
	for _, f := range split.Folders {
		b.Folders = append(b.Folders, storage.RowWrite{ID: f.ID, Body: f.Body})
	}
	for _, id := range slices.Sorted(maps.Keys(split.Entries)) {
		b.Entries = append(b.Entries, storage.EntryPut{ID: id, Folder: split.Entries[id]})
	}
	return b
}

// putBook は、置き場所 store にブックの本文 body を置く（Hub を作る前の用意）
func putBook(t *testing.T, store storage.Storage, body string) {
	t.Helper()
	if err := store.Apply(bookBatch(t, body)); err != nil {
		t.Fatal(err)
	}
}

func newServer(t *testing.T, stop func()) *httptest.Server {
	return newServerWith(t, Options{Stop: stop})
}

// newServerWith は、o に画面のファイル・合言葉・版・世界を足した常駐
func newServerWith(t *testing.T, o Options) *httptest.Server {
	web := fstest.MapFS{
		"index.html": {Data: []byte("<!doctype html>top")},
		"app.js":     {Data: []byte("js")},
	}
	store, err := storage.OpenSQLite(filepath.Join(t.TempDir(), "data.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { store.Close() })
	eng, err := engine.New()
	if err != nil {
		t.Fatal(err)
	}
	// 追加プラグインは、利用者が有効にするまで無効。このテストで足す見本は、はじめから有効にしておく（有効・無効の確かめは TestAddedPluginsAreOffUntilEnabled）
	if err := store.PutSettings(user, json.RawMessage(`{"`+enabledPluginsSetting+`":["a","b","ex1","ex2","ex3","ex9","ex10","ex12","ex14"]}`)); err != nil {
		t.Fatal(err)
	}
	hub, err := NewHub(store, eng)
	if err != nil {
		t.Fatal(err)
	}
	o.Web, o.Token, o.Version, o.Hub = web, "secret", "v1", hub
	if o.Cookies == nil {
		o.Cookies = NewScreenCookies(nil, nil)
	}
	s := httptest.NewUnstartedServer(withRoutesForTest(Handler(o), o))
	s.Config.RegisterOnShutdown(hub.CloseAll)
	s.Start()
	cookieTestBrowser(t, s, o.Cookies)
	t.Cleanup(hub.CloseAll)
	t.Cleanup(s.Close)
	return s
}

func get(t *testing.T, url, token string) (int, string) {
	t.Helper()
	req, _ := http.NewRequest(http.MethodGet, url, nil)
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()
	b, _ := io.ReadAll(res.Body)
	return res.StatusCode, string(b)
}

func TestServesScreen(t *testing.T) {
	s := newServer(t, nil)
	if code, body := get(t, s.URL+"/", ""); code != 200 || body != "<!doctype html>top" {
		t.Fatalf("/ = %d %q", code, body)
	}
	if code, body := get(t, s.URL+"/app.js", ""); code != 200 || body != "js" {
		t.Fatalf("/app.js = %d %q", code, body)
	}
	if code, _ := get(t, s.URL+"/nope.js", ""); code != 404 {
		t.Fatalf("/nope.js = %d", code)
	}
	if code, _ := get(t, s.URL+"/api/nope", "secret"); code != 404 {
		t.Fatalf("/api/nope = %d", code)
	}
}

func TestPingNeedsToken(t *testing.T) {
	s := newServer(t, nil)
	for _, token := range []string{"", "wrong"} {
		if code, _ := get(t, s.URL+"/api/ping", token); code != 401 {
			t.Fatalf("ping with %q = %d; want 401", token, code)
		}
	}
	if code, body := get(t, s.URL+"/api/ping", "secret"); code != 200 || body == "" {
		t.Fatalf("ping = %d %q", code, body)
	}
}

func TestStopNeedsTokenAndPost(t *testing.T) {
	stopped := make(chan struct{}, 1)
	s := newServer(t, func() { stopped <- struct{}{} })
	post := func(token string) int {
		req, _ := http.NewRequest(http.MethodPost, s.URL+"/api/stop", nil)
		req.Header.Set("Authorization", "Bearer "+token)
		res, err := http.DefaultClient.Do(req)
		if err != nil {
			t.Fatal(err)
		}
		res.Body.Close()
		return res.StatusCode
	}
	if code := post("wrong"); code != 401 {
		t.Fatalf("stop with a wrong token = %d", code)
	}
	if code, _ := get(t, s.URL+"/api/stop", "secret"); code == 200 {
		t.Fatalf("GET stop = %d; want a refusal", code)
	}
	if code := post("secret"); code != 200 {
		t.Fatalf("stop = %d", code)
	}
	<-stopped
}

// cookieTestBrowser は、テストの常駐 s に画面 cookie を持つブラウザを 1 つ作る。画面からの頼みは、この鍵が要る（send と listen は、この鍵を cookie に付ける）
func cookieTestBrowser(t *testing.T, s *httptest.Server, p *ScreenCookies) {
	t.Helper()
	secret, _ := p.Redeem(p.NewCode())
	_, port, _ := net.SplitHostPort(strings.TrimPrefix(s.URL, "http://"))
	testCookies.Store(s.URL, "matomezu-"+port+"="+secret)
	t.Cleanup(func() { testCookies.Delete(s.URL) })
}

// testCookies は、テストの常駐の URL ごとの、画面 cookie を持つブラウザの cookie
var testCookies sync.Map

// testCookie は、url の常駐の画面 cookie を持つブラウザの cookie
func testCookie(url string) (cookie string) {
	testCookies.Range(func(k, v any) bool {
		if strings.HasPrefix(url, k.(string)) {
			cookie = v.(string)
		}
		return true
	})
	return cookie
}

// send は画面からの頼みを送る（headers の Origin などはそのまま付ける）
func send(t *testing.T, method, url, body string, headers map[string]string) (int, string) {
	t.Helper()
	if _, own := headers["Cookie"]; !own {
		if c := testCookie(url); c != "" {
			headers = maps.Clone(headers)
			if headers == nil {
				headers = map[string]string{}
			}
			headers["Cookie"] = c
		}
	}
	req, _ := http.NewRequest(method, url, strings.NewReader(body))
	if body != "" {
		req.Header.Set("Content-Type", "application/json")
	}
	for k, v := range headers {
		req.Header.Set(k, v)
	}
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()
	b, _ := io.ReadAll(res.Body)
	return res.StatusCode, strings.TrimSpace(string(b))
}

// pluginDir は追加プラグインのフォルダ（files に matomezu.json を足したもの）
func pluginDir(t *testing.T, id string, files map[string]string) string {
	t.Helper()
	dir := t.TempDir()
	files["matomezu.json"] = `{ "id": "` + id + `", "engine": "index.ts", "ui": "ui.tsx" }`
	for name, text := range files {
		if err := os.WriteFile(filepath.Join(dir, name), []byte(text), 0o600); err != nil {
			t.Fatal(err)
		}
	}
	return dir
}

// copyDir は from を新しいフォルダに写し、すぐ下のファイルを change で書き換える
func copyDir(t *testing.T, from string, change func(name, text string) string) string {
	t.Helper()
	dir := t.TempDir()
	if err := os.CopyFS(dir, os.DirFS(from)); err != nil {
		t.Fatal(err)
	}
	entries, err := os.ReadDir(dir)
	if err != nil {
		t.Fatal(err)
	}
	for _, e := range entries {
		if e.IsDir() {
			continue
		}
		path := filepath.Join(dir, e.Name())
		b, err := os.ReadFile(path)
		if err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(path, []byte(change(e.Name(), string(b))), 0o600); err != nil {
			t.Fatal(err)
		}
	}
	return dir
}

var ai = map[string]string{"Authorization": "Bearer secret"}

func link(t *testing.T, s *httptest.Server, dir string) string {
	t.Helper()
	body, _ := json.Marshal(map[string]string{"dir": dir})
	_, got := send(t, "POST", s.URL+"/api/plugins", string(body), ai)
	return got
}

func TestServesTheAddedPluginsToTheScreen(t *testing.T) {
	s := newServer(t, nil)
	a := pluginDir(t, "a", map[string]string{"index.ts": `export default { id: "a" }`, "ui.tsx": `import "./a.css"` + "\nexport default 1", "a.css": ".a{color:red}"})
	b := pluginDir(t, "b", map[string]string{"index.ts": `export default { id: "b" }`, "ui.tsx": "export default 2"})
	for id, dir := range []string{a, b} {
		if got := link(t, s, dir); got != `{"id":"`+[]string{"a", "b"}[id]+`","ok":true}` {
			t.Fatalf("link %s = %s", dir, got)
		}
	}
	want := `"plugins":[{"id":"a","ui":"api/plugins/0/ui.js?v=2","css":"api/plugins/0/ui.css?v=2"},{"id":"b","ui":"api/plugins/1/ui.js?v=2"}]`
	if code, body := send(t, "GET", s.URL+"/api/data", "", nil); code != 200 || !strings.Contains(body, want) {
		t.Fatalf("data = %d %s", code, body)
	}
	for path, body := range map[string]string{"0/ui.js": "ui_default = 1", "0/ui.css": "color: red", "1/ui.js": "ui_default = 2"} {
		if code, got := send(t, "GET", s.URL+"/api/plugins/"+path, "", nil); code != 200 || !strings.Contains(got, body) {
			t.Fatalf("%s = %d %s", path, code, got)
		}
	}
	for _, path := range []string{"1/ui.css", "2/ui.js", "x/ui.js", "0/other.js"} {
		if code, _ := send(t, "GET", s.URL+"/api/plugins/"+path, "", nil); code != 404 {
			t.Fatalf("%s = %d, want 404", path, code)
		}
	}
	if code, _ := send(t, "GET", s.URL+"/api/plugins/0/ui.js", "", map[string]string{"Origin": "http://evil.example"}); code != 403 {
		t.Fatalf("from another site = %d, want 403", code)
	}
	if code, _ := send(t, "POST", s.URL+"/api/plugins", `{"dir":"`+a+`"}`, nil); code != 401 {
		t.Fatalf("link without the token = %d, want 401", code)
	}
}

func TestAddsReplacesAndRemovesPluginsWhileRunning(t *testing.T) {
	s := newServer(t, nil)
	ai := joinedAI(t, s)
	screen := listen(t, s.URL)
	next(t, screen) // hello
	catalog := func() string { _, c := get(t, s.URL+"/api/ai/catalog", "secret"); return c }
	entries := func(id string) string { _, c := get(t, s.URL+"/api/ai/catalog?ids="+id, "secret"); return c }
	perform := func(body string) string {
		_, got := send(t, "POST", s.URL+"/api/ai/perform", body, ai)
		return got
	}
	flow := "../../test/added-plugins/ex2"

	// 足す: 画面に知らせ、そのタイプのブックを作れる
	if got := link(t, s, flow); got != `{"id":"ex2","ok":true}` {
		t.Fatalf("link = %s", got)
	}
	if got := next(t, screen); got != `plugins {"version":1}` {
		t.Fatalf("event = %s", got)
	}
	made := perform(`{"action":"@matomezu/base:book-create","args":{"title":"F"}}`)
	if !strings.Contains(made, `"ok":true`) {
		t.Fatalf("@matomezu/base:book-create = %s", made)
	}
	var created struct{ Result struct{ Book string } }
	_ = json.Unmarshal([]byte(made), &created)
	next(t, screen) // changed
	if got := perform(`{"action":"@matomezu/base:page-add","args":{"type":"ex2:flow","title":"P"},"on":{"book":"` + created.Result.Book + `"}}`); !strings.Contains(got, `"ok":true`) {
		t.Fatalf("@matomezu/base:page-add = %s", got)
	}
	next(t, screen) // changed
	_, read := get(t, s.URL+"/api/ai/books/"+created.Result.Book, "secret")
	var book struct {
		Book struct {
			Pages []struct{ ID string } `json:"lineup"`
		}
	}
	if json.Unmarshal([]byte(read), &book) != nil || len(book.Book.Pages) == 0 {
		t.Fatalf("book = %s", read)
	}
	place := `{"action":"@matomezu/paper:item-place","args":{"item":"ex2:diamond","at":{"x":40,"y":40},"props":{"caption":"D"},"crowd":"push"},"on":{"page":"` + book.Book.Pages[0].ID + `"}}`
	if got := perform(place); !strings.Contains(got, `"ok":true`) {
		t.Fatalf("place = %s", got)
	}
	next(t, screen) // changed

	// 入れ替える: 同じ id のフォルダを足すと、新しいコードで組み直す
	changed := copyDir(t, flow, func(name, text string) string {
		return strings.ReplaceAll(text, `size: DIAMOND_SIZE,`, `size: { w: 123, h: 64 },`) // min は変えない（置いた形が読めなくなる）
	})
	if got := link(t, s, changed); got != `{"id":"ex2","ok":true}` {
		t.Fatalf("replace = %s", got)
	}
	if got := next(t, screen); got != `plugins {"version":2}` {
		t.Fatalf("event = %s", got)
	}
	if c := entries("ex2:diamond"); !strings.Contains(c, `"w":123`) || strings.Count(c, `"id":"ex2:diamond"`) != 1 {
		t.Fatalf("catalog after replacing = %s", c)
	}
	if got := perform(place); !strings.Contains(got, `"ok":true`) {
		t.Fatalf("place after replacing = %s", got)
	}
	next(t, screen) // changed

	// 台帳アセンブルで食い違うものを足しても、前のまま動き続ける
	broken := copyDir(t, flow, func(name, text string) string {
		return strings.ReplaceAll(text, `items: [DIAMOND]`, `items: [DIAMOND, DIAMOND]`)
	})
	if got := link(t, s, broken); !strings.Contains(got, `"ok":false`) {
		t.Fatalf("link a broken plugin = %s", got)
	}
	if c := entries("ex2:diamond"); !strings.Contains(c, `"w":123`) {
		t.Fatalf("catalog after a refused plugin = %s", c)
	}
	if got := perform(place); !strings.Contains(got, `"ok":true`) {
		t.Fatalf("place after a refused plugin = %s", got)
	}
	next(t, screen) // changed

	// 外す: そのタイプのブックではアクションを断り、ほかは動く
	if _, got := send(t, "POST", s.URL+"/api/plugins/remove", `{"id":"ex2"}`, ai); got != `{"ok":true}` {
		t.Fatalf("remove = %s", got)
	}
	if got := next(t, screen); got != `plugins {"version":3}` {
		t.Fatalf("event = %s", got)
	}
	// 定義から消える（読めなくなったブックの warning W004 には ex2 の名前が残る）
	if c := catalog(); strings.Contains(c, `"id":"ex2:`) || !strings.Contains(c, "W004 ex2") {
		t.Fatalf("catalog after removing = %s", c)
	}
	if got := perform(place); strings.Contains(got, `"ok":true`) {
		t.Fatalf("place after removing = %s", got)
	}
	if got := perform(`{"action":"@matomezu/base:book-create","args":{"title":"D","page":{"type":"@matomezu/drawing:drawing"}}}`); !strings.Contains(got, `"ok":true`) {
		t.Fatalf("@matomezu/base:book-create drawing = %s", got)
	}
	if _, got := send(t, "POST", s.URL+"/api/plugins/remove", `{"id":"ex2"}`, ai); !strings.Contains(got, `"ok":false`) {
		t.Fatalf("remove again = %s", got)
	}
}

func TestBooksAreKeptWithVersions(t *testing.T) {
	s := newServer(t, nil)
	// 常駐が初めて起動したときに、最初のプロジェクトを 1 つ作る（runsOnceAtStart）
	if code, body := send(t, "GET", s.URL+"/api/data", "", nil); code != 200 ||
		!strings.HasPrefix(body, `{"annotations":{},"counters":{},"folders":[],"pages":[],"participantCalls":{},"participantLive":{},"participantReady":[],"plugins":[],"records":{"@matomezu/taskboard:project":{"`) ||
		!strings.Contains(body, `},"settings":{"`+enabledPluginsSetting+`":[`) || !strings.HasSuffix(body, `]},"touched":{}}`) {
		t.Fatalf("empty data = %d %s", code, body)
	}
	book := func(title string) string {
		return `{"id":"b1","title":"` + title + `","lineup":[]}`
	}
	put := func(title string, base int) (int, string) {
		return send(t, "PUT", s.URL+"/api/books-for-test/b1", `{"book":`+book(title)+`,"base":`+strconv.Itoa(base)+`}`, nil)
	}
	if code, body := put("A", 0); code != 200 || body != `{"version":1}` {
		t.Fatalf("add = %d %s", code, body)
	}
	if code, body := put("B", 1); code != 200 || body != `{"version":2}` {
		t.Fatalf("update = %d %s", code, body)
	}
	// 触れた時刻（touched）は書いた時刻なので、その前までを比べる
	want := `{"annotations":{},"counters":{},"folders":[{"id":"b1","folder":{"folderRole":"book","id":"b1","lineup":[],"title":"B"},"version":2}],"pages":[],"participantCalls":{},"participantLive":{},"participantReady":[],"plugins":[],"records":{"@matomezu/taskboard:project":`
	if code, body := send(t, "GET", s.URL+"/api/data", "", nil); code != 200 || !strings.HasPrefix(body, want) || !strings.Contains(body, `"touched":{"b1":"`) {
		t.Fatalf("data = %d %s", code, body)
	}
}

func TestResetForTestLeavesOnlyTheGivenBooks(t *testing.T) {
	s := newServer(t, nil)
	book := func(id string) string {
		return `{"id":"` + id + `","title":"t","lineup":[]}`
	}
	send(t, "PUT", s.URL+"/api/books-for-test/b1", `{"book":`+book("b1")+`,"base":0}`, nil)
	send(t, "POST", s.URL+"/api/perform", `{"action":"@matomezu/base:settings-set","args":{"values":{"@matomezu/base:skin":"@matomezu/base:dark"}},"lang":"ja"}`, nil)
	if code, body := send(t, "POST", s.URL+"/api/reset-for-test", `{"books":[`+book("b3")+`,`+book("b2")+`]}`, nil); code != 200 {
		t.Fatalf("reset = %d %s", code, body)
	}
	folder := func(id string) string {
		return `{"id":"` + id + `","folder":{"folderRole":"book","id":"` + id + `","lineup":[],"title":"t"},"version":1}`
	}
	// 触れた時刻（touched）は置いた時刻なので、その前までを比べる
	want := `{"annotations":{},"counters":{},"folders":[` + folder("b2") + `,` + folder("b3") + `],"pages":[],"participantCalls":{},"participantLive":{},"participantReady":[],"plugins":[],"records":{},"settings":null,"touched":{`
	if code, body := send(t, "GET", s.URL+"/api/data", "", nil); code != 200 || !strings.HasPrefix(body, want) {
		t.Fatalf("data = %d %s", code, body)
	}
	// AI に見せる並びは、置いた順
	if _, got := send(t, "GET", s.URL+"/api/ai/books", "", ai); got != `{"books":[{"id":"b3","title":"t","version":1},{"id":"b2","title":"t","version":1}]}` {
		t.Fatalf("ai books = %s", got)
	}
	if code, _ := send(t, "POST", s.URL+"/api/reset-for-test", `{"books":[{"title":"no id"}]}`, nil); code != 400 {
		t.Fatalf("a book without an id = %d", code)
	}
}

func TestScreenAPIOnlyFromItsOwnPage(t *testing.T) {
	s := newServer(t, nil)
	host := strings.TrimPrefix(s.URL, "http://")
	cases := []struct {
		name    string
		headers map[string]string
		want    int
	}{
		{"own page", map[string]string{"Origin": s.URL}, 200},
		{"another site", map[string]string{"Origin": "https://evil.example"}, 403},
		{"a name pointed at this machine", map[string]string{"Host": "evil.example:" + strings.Split(host, ":")[1]}, 403},
	}
	for _, c := range cases {
		req, _ := http.NewRequest("POST", s.URL+"/api/perform", strings.NewReader(`{"action":"nope"}`))
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Cookie", testCookie(s.URL))
		for k, v := range c.headers {
			req.Header.Set(k, v)
		}
		if h, ok := c.headers["Host"]; ok {
			req.Host = h
		}
		res, err := http.DefaultClient.Do(req)
		if err != nil {
			t.Fatal(err)
		}
		res.Body.Close()
		if res.StatusCode != c.want {
			t.Errorf("%s = %d; want %d", c.name, res.StatusCode, c.want)
		}
	}
	req, _ := http.NewRequest("POST", s.URL+"/api/perform", strings.NewReader(`{}`))
	req.Header.Set("Content-Type", "text/plain")
	req.Header.Set("Cookie", testCookie(s.URL))
	res, _ := http.DefaultClient.Do(req)
	res.Body.Close()
	if res.StatusCode != 415 {
		t.Errorf("a body that is not JSON = %d; want 415", res.StatusCode)
	}
}

const drawing = `{"id":"b1","title":"T","lineup":[{"kind":"page","id":"p1","type":"@matomezu/drawing:drawing","title":"P","paper":"@matomezu/base:a4","orientation":"landscape"}]}`

// listen は /api/events につなぎ、届いたイベントを「名前 data」の行で返す通り道
func listen(t *testing.T, url string) <-chan string {
	t.Helper()
	req, _ := http.NewRequest(http.MethodGet, url+"/api/events", nil)
	req.Header.Set("Cookie", testCookie(url))
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { res.Body.Close() })
	lines := make(chan string, 16)
	go func() {
		defer close(lines)
		sc := bufio.NewScanner(res.Body)
		name := ""
		for sc.Scan() {
			l := sc.Text()
			if v, ok := strings.CutPrefix(l, "event: "); ok {
				name = v
			} else if v, ok := strings.CutPrefix(l, "data: "); ok {
				lines <- name + " " + v
			}
		}
	}()
	return lines
}

// next は次の知らせ（ブックに触れた時刻の知らせ touched は飛ばす。touched は nextTouched で読む）
func next(t *testing.T, lines <-chan string) string {
	t.Helper()
	for {
		l := nextAny(t, lines)
		if !strings.HasPrefix(l, "touched ") {
			return l
		}
	}
}

func nextAny(t *testing.T, lines <-chan string) string {
	t.Helper()
	select {
	case l := <-lines:
		return l
	case <-time.After(3 * time.Second):
		t.Fatal("no event")
		return ""
	}
}

// nextTouched は次の、ブックに触れた時刻の知らせ（ほかの知らせは飛ばす）
func nextTouched(t *testing.T, lines <-chan string) string {
	t.Helper()
	for {
		if l := nextAny(t, lines); strings.HasPrefix(l, "touched ") {
			return l
		}
	}
}

func TestPerformTellsEveryScreen(t *testing.T) {
	s := newServer(t, nil)
	send(t, "PUT", s.URL+"/api/books-for-test/b1", `{"book":`+drawing+`,"base":0}`, nil)
	a, b := listen(t, s.URL), listen(t, s.URL)
	if got := next(t, a); got != `hello {"client":"c1"}` {
		t.Fatalf("a hello = %s", got)
	}
	next(t, b)
	code, body := send(t, "POST", s.URL+"/api/perform",
		`{"action":"@matomezu/paper:item-place","args":{"item":"@matomezu/box:shape-nest-box","at":{"x":1,"y":2}},"on":{"page":"p1"},"lang":"ja","ids":["k1"],"client":"c1","seq":7}`, nil)
	if code != 200 || body != `{"ok":true,"result":{"item":"k1","at":{"x":1,"y":2}}}` {
		t.Fatalf("perform = %d %s", code, body)
	}
	for name, lines := range map[string]<-chan string{"a": a, "b": b} {
		got := next(t, lines)
		// 変わったのはページ p1 だけ: pages にその 1 枚が新しい版で並び、folders は空
		if !strings.HasPrefix(got, `changed {"act":"`) || !strings.Contains(got, `-2","action":"@matomezu/paper:item-place","books":["b1"],"by":"window","client":"c1","folders":[],"pages":[{"id":"p1","page":{`) ||
			!strings.Contains(got, `"id":"k1"`) || !strings.HasSuffix(got, `},"version":2}],"seq":7}`) {
			t.Fatalf("%s changed = %s", name, got)
		}
	}
	if got := next(t, a); got != `ack {"ok":true,"reason":"","seq":7}` {
		t.Fatalf("a ack = %s", got)
	}
	// 版が上がるのはそのページだけで、ブックのフォルダの版は変わらない
	_, data := send(t, "GET", s.URL+"/api/data", "", nil)
	if !strings.Contains(data, `"id":"k1"`) || !strings.Contains(data, `"bodyAlign":"left"}}]},"version":2}],"participantCalls"`) ||
		!strings.Contains(data, `"folders":[{"id":"b1","folder":{"folderRole":"book","id":"b1","lineup":[{"id":"p1","kind":"page"}],"title":"T"},"version":1}]`) {
		t.Fatalf("data = %s", data)
	}
}

func TestSameKeyIsPerformedOnce(t *testing.T) {
	s := newServer(t, nil)
	send(t, "PUT", s.URL+"/api/books-for-test/b1", `{"book":`+drawing+`,"base":0}`, nil)
	a := listen(t, s.URL)
	next(t, a)
	place := func(client string, seq int) string {
		_, body := send(t, "POST", s.URL+"/api/perform",
			fmt.Sprintf(`{"action":"@matomezu/paper:item-place","args":{"item":"@matomezu/box:shape-nest-box","at":{"x":1,"y":2}},"on":{"page":"p1"},"lang":"ja","ids":["k1"],"client":%q,"seq":%d,"key":"x1"}`, client, seq), nil)
		return body
	}
	first := place("c1", 1)
	next(t, a) // changed
	next(t, a) // ack
	// 答えが届かずつなぎ直した画面が、同じ番号で送り直す: 行わずに前の結果を返し、新しいつながりに ack だけを送る
	b := listen(t, s.URL)
	next(t, b)
	if again := place("c2", 1); again != first {
		t.Fatalf("again = %s, first = %s", again, first)
	}
	if got := next(t, b); got != `ack {"ok":true,"reason":"","seq":1}` {
		t.Fatalf("ack = %s", got)
	}
	_, data := send(t, "GET", s.URL+"/api/data", "", nil)
	if strings.Count(data, `"id":"k1"`) != 1 || !strings.Contains(data, `"version":2`) {
		t.Fatalf("data = %s", data)
	}
}

func TestRefusedActionChangesNothing(t *testing.T) {
	s := newServer(t, nil)
	send(t, "PUT", s.URL+"/api/books-for-test/b1", `{"book":`+drawing+`,"base":0}`, nil)
	a := listen(t, s.URL)
	next(t, a)
	code, body := send(t, "POST", s.URL+"/api/perform",
		`{"action":"@matomezu/paper:item-update","args":{"item":"gone","props":{}},"on":{"page":"p1"},"lang":"ja","client":"c1","seq":1}`, nil)
	if code != 200 || !strings.HasPrefix(body, `{"ok":false,"reason":"refused","detail":`) {
		t.Fatalf("perform = %d %s", code, body)
	}
	if got := next(t, a); got != `ack {"ok":false,"reason":"refused","seq":1}` {
		t.Fatalf("ack = %s", got)
	}
}

func TestSettingsActions(t *testing.T) {
	s := newServer(t, nil)
	ai := joinedAI(t, s)
	a := listen(t, s.URL)
	next(t, a)
	send(t, "POST", s.URL+"/api/perform", `{"action":"@matomezu/base:settings-set","args":{"values":{"@matomezu/base:skin":"@matomezu/base:dark"}},"lang":"ja"}`, nil)
	if got := next(t, a); !strings.HasPrefix(got, `settings {`) || !strings.Contains(got, `"@matomezu/base:skin":"@matomezu/base:dark"`) {
		t.Fatalf("settings = %s", got)
	}
	_, data := send(t, "GET", s.URL+"/api/data", "", nil)
	if !strings.Contains(data, `"@matomezu/base:skin":"@matomezu/base:dark"`) {
		t.Fatalf("data = %s", data)
	}
	// AI も設定を読んで変えられる
	if _, got := send(t, "GET", s.URL+"/api/ai/settings", "", ai); !strings.Contains(got, `"@matomezu/base:skin":"@matomezu/base:dark"`) {
		t.Fatalf("ai settings = %s", got)
	}
	if _, got := send(t, "POST", s.URL+"/api/ai/perform", `{"action":"@matomezu/base:settings-set","args":{"values":{"@matomezu/base:skin":"@matomezu/base:light"}}}`, ai); got != `{"ok":true,"result":{}}` {
		t.Fatalf("ai perform = %s", got)
	}
}

// ページが宛先のアクションは、そのページを持っているブックで行い、そのページを書く。ゴミ箱のブックのページは no-page
func TestPerformOnAPage(t *testing.T) {
	s := newServer(t, nil)
	send(t, "PUT", s.URL+"/api/books-for-test/b1", `{"book":`+drawing+`,"base":0}`, nil)
	a := listen(t, s.URL)
	next(t, a)
	perform := func(action, args, on string) string {
		_, got := send(t, "POST", s.URL+"/api/perform", `{"action":"@matomezu/base:`+action+`","args":`+args+`,"on":`+on+`,"lang":"ja","now":"2026-10-29T00:00:00.000Z"}`, nil)
		return got
	}
	if got := perform("page-lock", `{}`, `{"page":"p1"}`); got != `{"ok":true,"result":{}}` {
		t.Fatalf("lock = %s", got)
	}
	if got := next(t, a); !strings.HasPrefix(got, "changed ") || !strings.Contains(got, `"books":["b1"]`) || !strings.Contains(got, `"folders":[],"pages":[{"id":"p1","page":{`) || !strings.Contains(got, `"locked":true},"version":2}]`) {
		t.Fatalf("changed after lock = %s", got)
	}
	perform("page-unlock", `{}`, `{"page":"p1"}`)
	if got := perform("book-trash", `{"book":"b1"}`, `null`); got != `{"ok":true,"result":{}}` {
		t.Fatalf("trash = %s", got)
	}
	if got := perform("page-lock", `{}`, `{"page":"p1"}`); !strings.Contains(got, `"reason":"no-page"`) {
		t.Fatalf("lock a page of a trashed book = %s", got)
	}
}

// ほかのブックにもう在る id のページを足すアクションは refused で断られ、何も変わらない（ページの id は世界の中で重ならない）
func TestAddingAPageWithAnIdAnotherBookHasIsRefused(t *testing.T) {
	s := newServer(t, nil)
	send(t, "PUT", s.URL+"/api/books-for-test/b1", `{"book":`+drawing+`,"base":0}`, nil)
	send(t, "PUT", s.URL+"/api/books-for-test/b2", `{"book":{"id":"b2","title":"U","lineup":[]},"base":0}`, nil)
	a := listen(t, s.URL)
	next(t, a)
	_, before := send(t, "GET", s.URL+"/api/data", "", nil)
	add := func(id string) string {
		_, got := send(t, "POST", s.URL+"/api/perform", `{"action":"@matomezu/base:page-add","args":{"type":"@matomezu/drawing:drawing","title":"追加"},"on":{"book":"b2"},"lang":"ja","ids":["`+id+`"],"client":"c1","seq":1}`, nil)
		return got
	}
	if got := add("p1"); !strings.HasPrefix(got, `{"ok":false,"reason":"refused"`) {
		t.Fatalf("add a page with the id of a page of another book = %s", got)
	}
	if got := next(t, a); got != `ack {"ok":false,"reason":"refused","seq":1}` {
		t.Fatalf("ack = %s", got)
	}
	if _, after := send(t, "GET", s.URL+"/api/data", "", nil); after != before {
		t.Fatalf("data changed:\n%s\n%s", before, after)
	}
	// ほかのブックのフォルダの id も同じ。世界に無い id なら足せる
	if got := add("b1"); !strings.HasPrefix(got, `{"ok":false,"reason":"refused"`) {
		t.Fatalf("add a page with the id of another book = %s", got)
	}
	next(t, a)
	if got := add("p2"); !strings.HasPrefix(got, `{"ok":true`) {
		t.Fatalf("add a page with a free id = %s", got)
	}
}

// ブックを作るアクションが最初のページに振る id も同じ: ほかのブックにもう在るページの id なら、断られて何も変わらない（在るページを書き換えない）
func TestCreatingABookWithAPageIdAnotherBookHasIsRefused(t *testing.T) {
	s := newServer(t, nil)
	send(t, "PUT", s.URL+"/api/books-for-test/b1", `{"book":`+boxed+`,"base":0}`, nil)
	_, before := send(t, "GET", s.URL+"/api/data", "", nil)
	_, got := send(t, "POST", s.URL+"/api/perform", `{"action":"@matomezu/base:book-create","args":{"title":"U","page":{"type":"@matomezu/drawing:drawing"}},"lang":"ja","ids":["b2","p1"]}`, nil)
	_, after := send(t, "GET", s.URL+"/api/data", "", nil)
	if !strings.HasPrefix(got, `{"ok":false,"reason":"refused"`) || after != before {
		t.Fatalf("book-create with the id of a page of another book = %s (the data changed: %v)", got, after != before)
	}
}

// ページを足すと、新しいページとブックのフォルダが changed に並び、置き場所のエントリの表にそのページ → ブックが入る。ページを消すと、表から消える
func TestAddingAndRemovingAPageKeepsTheEntries(t *testing.T) {
	path := filepath.Join(t.TempDir(), "data.db")
	store, err := storage.OpenSQLite(path)
	if err != nil {
		t.Fatal(err)
	}
	putBook(t, store, drawing)
	store.Close()
	h, s := hubAt(t, path)
	a := listen(t, s.URL)
	next(t, a)
	entries := func() string {
		got, err := h.store.Entries()
		if err != nil {
			t.Fatal(err)
		}
		return fmt.Sprint(got)
	}
	perform := func(action, args, on string, ids string) string {
		_, got := send(t, "POST", s.URL+"/api/perform", `{"action":"@matomezu/base:`+action+`","args":`+args+`,"on":`+on+`,"lang":"ja","ids":`+ids+`}`, nil)
		return got
	}
	if got := perform("page-add", `{"type":"@matomezu/drawing:drawing","title":"追加"}`, `{"book":"b1"}`, `["p2"]`); !strings.HasPrefix(got, `{"ok":true`) {
		t.Fatalf("page-add = %s", got)
	}
	got := next(t, a)
	if !strings.HasPrefix(got, "changed ") || !strings.Contains(got, `"books":["b1"]`) ||
		!strings.Contains(got, `"folders":[{"folder":{"id":"b1","title":"T","folderRole":"book","lineup":[{"kind":"page","id":"p1"},{"kind":"page","id":"p2"}]},"id":"b1","version":2}]`) ||
		!strings.Contains(got, `"pages":[{"id":"p2","page":{`) || !strings.Contains(got, `"title":"追加"`) || strings.Contains(got, `"id":"p1","page"`) {
		t.Fatalf("changed after page-add = %s", got)
	}
	if got := entries(); got != "map[p1:b1 p2:b1]" {
		t.Fatalf("entries after page-add = %s", got)
	}
	if h.PageVersion("p1") != 1 || h.PageVersion("p2") != 1 {
		t.Fatalf("page versions = %d %d", h.PageVersion("p1"), h.PageVersion("p2"))
	}
	if got := perform("page-remove", `{"page":"p2"}`, `{"book":"b1"}`, `[]`); !strings.HasPrefix(got, `{"ok":true`) {
		t.Fatalf("page-remove = %s", got)
	}
	got = next(t, a)
	if !strings.HasPrefix(got, "changed ") || !strings.Contains(got, `"lineup":[{"kind":"page","id":"p1"}]},"id":"b1","version":3}]`) || !strings.Contains(got, `"pages":[{"id":"p2","removed":true}]`) {
		t.Fatalf("changed after page-remove = %s", got)
	}
	if got := entries(); got != "map[p1:b1]" {
		t.Fatalf("entries after page-remove = %s", got)
	}
	if pages, _ := h.Tables(); len(pages) != 1 || pages[0].ID != "p1" {
		t.Fatalf("pages after page-remove = %+v", pages)
	}
}

// 常駐を起動し直しても（同じ置き場所から世界を作り直す）、バインダのあるブックは同じ中身に組み直され、ページとフォルダの版も同じ
func TestABookWithBindersIsAssembledTheSameAfterARestart(t *testing.T) {
	const book = `{"id":"b1","title":"T","lineup":[` +
		`{"kind":"page","id":"p1","type":"@matomezu/drawing:drawing","title":"図","paper":"@matomezu/base:a4","orientation":"landscape"},` +
		`{"kind":"binder","id":"f1","title":"スライド","pageType":"@matomezu/slide-book:slide","lineup":[]},` +
		`{"kind":"binder","id":"f2","title":"空","pageType":"@matomezu/slide-book:slide","lineup":[]}]}`
	path := filepath.Join(t.TempDir(), "data.db")
	// read は、AI に見せるブックと、画面に渡すページとフォルダ（触れた時刻の前まで）
	read := func(s *httptest.Server) (string, string) {
		code, shown := send(t, "GET", s.URL+"/api/ai/books/b1", "", ai)
		if code != 200 {
			t.Fatalf("ai book = %d %s", code, shown)
		}
		_, data := send(t, "GET", s.URL+"/api/data", "", nil)
		tables, _, _ := strings.Cut(data, `"participantCalls"`)
		return shown, tables
	}
	var shown, tables string
	ok := t.Run("before", func(t *testing.T) {
		_, s := hubAt(t, path)
		if code, body := send(t, "PUT", s.URL+"/api/books-for-test/b1", `{"book":`+book+`,"base":0}`, nil); code != 200 {
			t.Fatalf("put = %d %s", code, body)
		}
		// バインダにページを足し、版がそろわないように、ページ 1 枚とバインダを変えておく
		for _, req := range []string{
			`{"action":"@matomezu/base:page-add","args":{"type":"@matomezu/slide-book:slide","title":"1","into":{"binder":"f1"}},"on":{"book":"b1"},"lang":"ja","ids":["s1"]}`,
			`{"action":"@matomezu/base:page-add","args":{"type":"@matomezu/slide-book:slide","title":"2","into":{"binder":"f1"}},"on":{"book":"b1"},"lang":"ja","ids":["s2"]}`,
			`{"action":"@matomezu/base:page-update","args":{"title":"図 2"},"on":{"page":"p1"},"lang":"ja"}`,
			`{"action":"@matomezu/base:page-remove","args":{"page":"s1"},"on":{"book":"b1"},"lang":"ja"}`,
		} {
			if _, got := send(t, "POST", s.URL+"/api/perform", req, nil); !strings.HasPrefix(got, `{"ok":true`) {
				t.Fatalf("%s = %s", req, got)
			}
		}
		shown, tables = read(s)
	})
	if !ok {
		return
	}
	for _, want := range []string{`"title":"図 2"`, `"id":"f1"`, `"id":"s2"`, `"id":"f2"`} {
		if !strings.Contains(shown, want) {
			t.Fatalf("ai book = %s; want %s", shown, want)
		}
	}
	if strings.Contains(shown, `"id":"s1"`) || !strings.Contains(tables, `"id":"f1","folder":{`) || !strings.Contains(tables, `"version":4`) {
		t.Fatalf("ai book = %s\ntables = %s", shown, tables)
	}
	_, s := hubAt(t, path)
	if again, tablesAgain := read(s); again != shown || tablesAgain != tables {
		t.Fatalf("after a restart:\n%s\n%s\nbefore:\n%s\n%s", again, tablesAgain, shown, tables)
	}
}

// book-trash はブックに trashed の時刻を付けて知らせ（AI の読む口からは外れる）、/api/data にはゴミ箱に入ったまま出る。book-restore で戻し、trash-empty で消す（ブックのフォルダとページが removed で並ぶ）
func TestTrashABook(t *testing.T) {
	s := newServer(t, nil)
	send(t, "PUT", s.URL+"/api/books-for-test/b1", `{"book":`+drawing+`,"base":0}`, nil)
	a := listen(t, s.URL)
	next(t, a)
	perform := func(action, args string) string {
		_, got := send(t, "POST", s.URL+"/api/perform", `{"action":"@matomezu/base:`+action+`","args":`+args+`,"lang":"ja","now":"2026-10-29T00:00:00.000Z"}`, nil)
		return got
	}
	if got := perform("book-trash", `{"book":"b1"}`); got != `{"ok":true,"result":{}}` {
		t.Fatalf("trash = %s", got)
	}
	// 変わるのはブックのフォルダだけ
	if got := next(t, a); !strings.HasPrefix(got, "changed ") || !strings.Contains(got, `"title":"T","trashed":"2026-10-29T00:00:00.000Z"`) || !strings.Contains(got, `"id":"b1","version":2}],"pages":[]`) {
		t.Fatalf("changed after trash = %s", got)
	}
	if _, data := send(t, "GET", s.URL+"/api/data", "", nil); !strings.Contains(data, `"trashed":"2026-10-29T00:00:00.000Z"`) {
		t.Fatalf("data = %s", data)
	}
	if _, got := send(t, "GET", s.URL+"/api/ai/books", "", ai); got != `{"books":[]}` {
		t.Fatalf("ai books = %s", got)
	}
	if code, _ := send(t, "GET", s.URL+"/api/ai/books/b1", "", ai); code != 404 {
		t.Fatalf("ai book = %d", code)
	}
	if got := perform("book-restore", `{"book":"b1"}`); got != `{"ok":true,"result":{}}` {
		t.Fatalf("restore = %s", got)
	}
	if got := next(t, a); !strings.HasPrefix(got, "changed ") || strings.Contains(got, `"trashed"`) || !strings.Contains(got, `"id":"b1","version":3}],"pages":[]`) {
		t.Fatalf("changed after restore = %s", got)
	}
	// 戻したブックは、AI の読む口にまた出る
	if code, _ := send(t, "GET", s.URL+"/api/ai/books/b1", "", ai); code != 200 {
		t.Fatalf("ai book after restore = %d", code)
	}
	perform("book-trash", `{"book":"b1"}`)
	next(t, a)
	if got := perform("trash-empty", `{}`); got != `{"ok":true,"result":{}}` {
		t.Fatalf("empty = %s", got)
	}
	if got := next(t, a); !strings.HasPrefix(got, "changed ") || !strings.Contains(got, `"books":["b1"]`) || !strings.Contains(got, `"folders":[{"id":"b1","removed":true}],"pages":[{"id":"p1","removed":true}]`) {
		t.Fatalf("changed after empty = %s", got)
	}
	if _, data := send(t, "GET", s.URL+"/api/data", "", nil); !strings.Contains(data, `"folders":[],"pages":[]`) || !strings.Contains(data, `"touched":{}`) {
		t.Fatalf("data after empty = %s", data)
	}
}

// AI はゴミ箱から戻せず、消せない（利用者だけのアクション）
func TestAICannotRestoreOrPurge(t *testing.T) {
	s := newServer(t, nil)
	send(t, "PUT", s.URL+"/api/books-for-test/b1", `{"book":`+drawing+`,"base":0}`, nil)
	send(t, "POST", s.URL+"/api/ai/perform", `{"action":"@matomezu/base:book-trash","args":{"book":"b1"}}`, ai)
	for _, req := range []string{
		`{"action":"@matomezu/base:book-restore","args":{"book":"b1"}}`,
		`{"action":"@matomezu/base:book-purge","args":{"books":["b1"]}}`,
		`{"action":"@matomezu/base:trash-empty","args":{}}`,
	} {
		if _, got := send(t, "POST", s.URL+"/api/ai/perform", req, ai); !strings.HasPrefix(got, `{"ok":false,"reason":"not-allowed","detail":`) {
			t.Fatalf("ai %s = %s", req, got)
		}
	}
}

// AI は、どこかの窓に出ているブックをゴミ箱に入れられない（open-on-screen）。出ていなければ入れられる
func TestAICannotTrashABookOnAScreen(t *testing.T) {
	s := newServer(t, nil)
	ai := joinedAI(t, s)
	send(t, "PUT", s.URL+"/api/books-for-test/b1", `{"book":`+drawing+`,"base":0}`, nil)
	a := listen(t, s.URL)
	next(t, a)
	send(t, "POST", s.URL+"/api/view", `{"client":"c1","view":`+window+`,"focused":true}`, nil)
	trash := `{"action":"@matomezu/base:book-trash","args":{"book":"b1"}}`
	if _, got := send(t, "POST", s.URL+"/api/ai/perform", trash, ai); got != `{"ok":false,"reason":"open-on-screen"}` {
		t.Fatalf("ai trash on a screen = %s", got)
	}
	if _, got := send(t, "GET", s.URL+"/api/ai/books", "", ai); !strings.Contains(got, `"id":"b1"`) {
		t.Fatalf("the book left: %s", got)
	}
	send(t, "POST", s.URL+"/api/view", `{"client":"c1","view":{"book":null,"stages":[{"id":"s1","book":null}]}}`, nil)
	if _, got := send(t, "POST", s.URL+"/api/ai/perform", trash, ai); got != `{"ok":true,"result":{}}` {
		t.Fatalf("ai trash = %s", got)
	}
}

// コントロールセンターを前に出している窓の後ろに、ブックスクリーンが開いているブックも、AI はゴミ箱に入れられない（open-on-screen）
func TestAICannotTrashABookBehindTheControlCenter(t *testing.T) {
	s := newServer(t, nil)
	ai := joinedAI(t, s)
	send(t, "PUT", s.URL+"/api/books-for-test/b1", `{"book":`+drawing+`,"base":0}`, nil)
	a := listen(t, s.URL)
	next(t, a)
	send(t, "POST", s.URL+"/api/view", `{"client":"c1","view":{"front":"control-center","hidden":{"book":"b1","stages":[{"id":"s1","book":"b1"}],"canSplit":true}},"focused":true}`, nil)
	trash := `{"action":"@matomezu/base:book-trash","args":{"book":"b1"}}`
	if _, got := send(t, "POST", s.URL+"/api/ai/perform", trash, ai); got != `{"ok":false,"reason":"open-on-screen"}` {
		t.Fatalf("ai trash behind the control center = %s", got)
	}
}

// コントロールセンターを前に出している間、後ろのブックスクリーンのブックは開いたことにならない。ブックスクリーンが前に戻ったら開いたことになる
func TestTouchedIgnoresTheBookScreenBehindTheControlCenter(t *testing.T) {
	s := newServer(t, nil)
	screen := listen(t, s.URL)
	next(t, screen)
	touched := func() map[string]string {
		_, body := send(t, "GET", s.URL+"/api/data", "", nil)
		var data struct {
			Touched map[string]string `json:"touched"`
		}
		if err := json.Unmarshal([]byte(body), &data); err != nil {
			t.Fatal(err)
		}
		return data.Touched
	}
	send(t, "POST", s.URL+"/api/view", `{"client":"c1","view":{"front":"control-center","hidden":{"book":"b0","stages":[{"id":"s1","book":"b0"}]}},"seq":1}`, nil)
	if got := touched(); got["b0"] != "" {
		t.Fatalf("touched behind the control center = %v", got)
	}
	send(t, "POST", s.URL+"/api/view", `{"client":"c1","view":{"front":"book-screen","book":"b0","stages":[{"id":"s1","book":"b0"}]},"seq":2}`, nil)
	nextTouched(t, screen)
	if got := touched(); got["b0"] == "" {
		t.Fatalf("touched after the book screen came to front = %v", got)
	}
}

// AI の view は、コントロールセンターを前に出している間、出している物（front）と、隠れているブックスクリーンの book・page（hidden）を分けて返す。
// show は隠れているブックスクリーンのステージを指せる
func TestViewSeparatesTheHiddenBookScreen(t *testing.T) {
	s := newServer(t, nil)
	send(t, "PUT", s.URL+"/api/books-for-test/b1", `{"book":`+drawing+`,"base":0}`, nil)
	a := listen(t, s.URL)
	next(t, a)
	send(t, "POST", s.URL+"/api/view", `{"client":"c1","view":{"front":"control-center","hidden":{"book":"b1","page":"p1","stage":"s1","stages":[{"id":"s1","book":"b1"}],"canSplit":true}},"focused":true}`, nil)
	_, got := send(t, "GET", s.URL+"/api/ai/view", "", ai)
	if got != `{"front":"control-center","hidden":{"awaiting":[],"book":"b1","canSplit":true,"page":"p1","stage":"s1","stages":[{"id":"s1","book":"b1"}]}}` {
		t.Fatalf("view = %s", got)
	}
	if _, body := send(t, "POST", s.URL+"/api/ai/show", `{"book":"b1","stage":"s1"}`, ai); !strings.Contains(body, `"ok":true`) {
		t.Fatalf("show onto a hidden stage = %s", body)
	}
	if _, body := send(t, "POST", s.URL+"/api/ai/show", `{"book":"b1","stage":"s9"}`, ai); !strings.Contains(body, `"no-stage"`) {
		t.Fatalf("show onto a stage that is not there = %s", body)
	}
}

// AI はロックを掛けられるが外せない（外すアクションは画面からだけ）。ロック中のブックは AI も変えられない
func TestAICanLockButNotUnlock(t *testing.T) {
	s := newServer(t, nil)
	send(t, "PUT", s.URL+"/api/books-for-test/b1", `{"book":`+drawing+`,"base":0}`, nil)
	on := `,"args":{},"on":{"book":"b1"}}`
	if _, got := send(t, "POST", s.URL+"/api/ai/perform", `{"action":"@matomezu/base:book-lock"`+on, ai); got != `{"ok":true,"result":{}}` {
		t.Fatalf("lock = %s", got)
	}
	if _, got := send(t, "POST", s.URL+"/api/ai/perform", `{"action":"@matomezu/base:book-update","args":{"title":"x"},"on":{"book":"b1"}}`, ai); !strings.HasPrefix(got, `{"ok":false,"reason":"denied","permission":"@matomezu/base:lock","detail":"by @matomezu/base:lock: the book or a page it would change is locked`) {
		t.Fatalf("update = %s", got)
	}
	if _, got := send(t, "POST", s.URL+"/api/ai/perform", `{"action":"@matomezu/base:book-unlock"`+on, ai); !strings.HasPrefix(got, `{"ok":false,"reason":"not-allowed","detail":`) {
		t.Fatalf("ai unlock = %s", got)
	}
	if _, got := send(t, "POST", s.URL+"/api/perform", `{"action":"@matomezu/base:book-unlock","lang":"ja"`+on, nil); got != `{"ok":true,"result":{}}` {
		t.Fatalf("unlock = %s", got)
	}
	// 外すアクションは AI の actions に出さない
	if _, got := send(t, "GET", s.URL+"/api/ai/catalog", "", ai); strings.Contains(got, "book-unlock") || !strings.Contains(got, "book-lock") {
		t.Fatalf("catalog lists book-unlock or misses book-lock")
	}
}

func TestViewIsTheLastFocusedScreens(t *testing.T) {
	s := newServerWith(t, Options{Latest: 50 * time.Millisecond})
	a, b := listen(t, s.URL), listen(t, s.URL)
	next(t, a)
	next(t, b)
	ai := func() string {
		_, body := send(t, "GET", s.URL+"/api/ai/view", "", map[string]string{"Authorization": "Bearer secret"})
		return body
	}
	// どの窓も知らせないまま上限を過ぎれば null
	if got := ai(); got != "null" {
		t.Fatalf("view before any report = %s", got)
	}
	send(t, "POST", s.URL+"/api/view", `{"client":"c1","view":{"book":"A"},"focused":true}`, nil)
	send(t, "POST", s.URL+"/api/view", `{"client":"c2","view":{"book":"B"}}`, nil)
	if got := ai(); got != `{"awaiting":[],"book":"A"}` {
		t.Fatalf("view = %s; want the focused screen's", got)
	}
	send(t, "POST", s.URL+"/api/view", `{"client":"c2","focused":true}`, nil)
	if got := ai(); got != `{"awaiting":[],"book":"B"}` {
		t.Fatalf("view after c2 is focused = %s", got)
	}
	if code, _ := send(t, "POST", s.URL+"/api/view", `{"client":"c9"}`, nil); code != 404 {
		t.Fatalf("an unknown client = %d", code)
	}
}

// 最後にフォーカスされた窓（つないだばかりの窓）がまだ知らせていなければ、AI の view は知らせが来るまで待ち、その窓の答えを返す（前の窓を選ばない）
func TestViewWaitsForTheLatestWindow(t *testing.T) {
	s := newServer(t, nil)
	a := listen(t, s.URL)
	next(t, a)
	send(t, "POST", s.URL+"/api/view", `{"client":"c1","view":{"book":"old"},"focused":true}`, nil)
	b := listen(t, s.URL)
	next(t, b)
	got := make(chan string)
	go func() {
		_, body := send(t, "GET", s.URL+"/api/ai/view", "", map[string]string{"Authorization": "Bearer secret"})
		got <- body
	}()
	time.Sleep(50 * time.Millisecond)
	start := time.Now()
	send(t, "POST", s.URL+"/api/view", `{"client":"c2","view":{"book":"new"}}`, nil)
	if body := <-got; body != `{"awaiting":[],"book":"new"}` {
		t.Fatalf("view = %s; want the latest window's", body)
	}
	if waited := time.Since(start); waited > time.Second {
		t.Fatalf("answered %v after the report; want at once", waited)
	}
}

// 窓の知らせは届く順が入れ替わることがあるので、受けたものより古い番号の見ているものは捨てる（フォーカスは数える）
func TestViewKeepsTheNewestReport(t *testing.T) {
	s := newServer(t, nil)
	a := listen(t, s.URL)
	next(t, a)
	send(t, "POST", s.URL+"/api/view", `{"client":"c1","view":{"stage":"s2"},"focused":true,"seq":2}`, nil)
	send(t, "POST", s.URL+"/api/view", `{"client":"c1","view":{"stage":"s1"},"seq":1}`, nil)
	if _, got := send(t, "GET", s.URL+"/api/ai/view", "", map[string]string{"Authorization": "Bearer secret"}); got != `{"awaiting":[],"stage":"s2"}` {
		t.Fatalf("view = %s; want the newer report", got)
	}
}

func TestAIEntrancesNeedTheToken(t *testing.T) {
	s := newServer(t, nil)
	send(t, "PUT", s.URL+"/api/books-for-test/b1", `{"book":`+drawing+`,"base":0}`, nil)
	auth := map[string]string{"Authorization": "Bearer secret"}
	for _, path := range []string{"/api/ai/view", "/api/ai/books", "/api/ai/books/b1", "/api/ai/settings", "/api/ai/catalog"} {
		if code, _ := send(t, "GET", s.URL+path, "", nil); code != 401 {
			t.Errorf("%s without the token = %d", path, code)
		}
	}
	if _, body := send(t, "GET", s.URL+"/api/ai/books", "", auth); body != `{"books":[{"id":"b1","title":"T","version":1}]}` {
		t.Fatalf("books = %s", body)
	}
	code, body := send(t, "POST", s.URL+"/api/ai/perform", `{"action":"@matomezu/base:page-add","args":{"type":"@matomezu/drawing:drawing","title":"Two"},"on":{"book":"b1"}}`, auth)
	if code != 200 || !strings.HasPrefix(body, `{"ok":true,"result":{"page":"`) {
		t.Fatalf("perform = %d %s", code, body)
	}
	if _, body := send(t, "GET", s.URL+"/api/ai/books/b1", "", auth); !strings.Contains(body, `"title":"Two"`) || !strings.Contains(body, `"version":2`) {
		t.Fatalf("book = %s", body)
	}
}

const window = `{"book":"b1","page":"p1","selection":[],"stage":"s1","stages":[{"id":"s1","book":"b1","page":"p1"}],"canSplit":true}`

func TestShowGoesToTheLastFocusedWindow(t *testing.T) {
	s := newServer(t, nil)
	send(t, "PUT", s.URL+"/api/books-for-test/b1", `{"book":`+drawing+`,"base":0}`, nil)
	a, b := listen(t, s.URL), listen(t, s.URL)
	next(t, a)
	next(t, b)
	auth := map[string]string{"Authorization": "Bearer secret"}
	show := func(body string) string {
		_, out := send(t, "POST", s.URL+"/api/ai/show", body, auth)
		return out
	}
	send(t, "POST", s.URL+"/api/view", `{"client":"c1","view":`+window+`}`, nil)
	send(t, "POST", s.URL+"/api/view", `{"client":"c2","view":`+strings.Replace(window, `"canSplit":true`, `"canSplit":false`, 1)+`,"focused":true}`, nil)
	if got := show(`{"book":"b1","page":"p1","stage":"s1"}`); got != "{\"ok\":true,\"opened\":false}" {
		t.Fatalf("show = %s", got)
	}
	if got := next(t, b); got != `show {"book":"b1","page":"p1","stage":"s1"}` {
		t.Fatalf("b = %s", got)
	}
	for body, reason := range map[string]string{
		`{"book":"gone"}`:            "no-book",
		`{"book":"b1","stage":"s9"}`: "no-stage",
		`{"book":"b1","split":true}`: "no-split",
	} {
		if got := show(body); !strings.Contains(got, `"reason":"`+reason+`"`) {
			t.Errorf("show %s = %s; want %s", body, got, reason)
		}
	}
	// ブックに触れた時刻の知らせ（窓が b1 を開いた）はどの窓にも届くので飛ばす
	for {
		select {
		case l := <-a:
			if strings.HasPrefix(l, "touched ") {
				continue
			}
			t.Fatalf("a window not focused last got %s", l)
		default:
		}
		break
	}
}

func TestShowOpensABrowserWhenNoWindowIsThere(t *testing.T) {
	var s *httptest.Server
	opened := make(chan (<-chan string), 1)
	s = newServerWith(t, Options{URL: "http://screen/", Open: func(url string) error {
		if !strings.HasPrefix(url, "http://screen/cookie?code=") {
			t.Errorf("the browser was opened at %s", url)
		}
		go func() {
			lines := listen(t, s.URL)
			<-lines // hello
			send(t, "POST", s.URL+"/api/view", `{"client":"c1","view":`+window+`,"focused":true}`, nil)
			opened <- lines
		}()
		return nil
	}})
	send(t, "PUT", s.URL+"/api/books-for-test/b1", `{"book":`+drawing+`,"base":0}`, nil)
	auth := map[string]string{"Authorization": "Bearer secret"}
	if _, got := send(t, "POST", s.URL+"/api/ai/show", `{"book":"b1","split":true}`, auth); got != "{\"ok\":true,\"opened\":true}" {
		t.Fatalf("show = %s", got)
	}
	if got := next(t, <-opened); got != `show {"book":"b1","split":true}` {
		t.Fatalf("the opened window got %s", got)
	}
}

func TestShowWithoutAWindowNorABrowser(t *testing.T) {
	s := newServerWith(t, Options{URL: "http://screen/", Wait: 50 * time.Millisecond, Open: func(string) error { return nil }})
	send(t, "PUT", s.URL+"/api/books-for-test/b1", `{"book":`+drawing+`,"base":0}`, nil)
	auth := map[string]string{"Authorization": "Bearer secret"}
	if _, got := send(t, "POST", s.URL+"/api/ai/show", `{"book":"b1"}`, auth); got != "{\"ok\":false,\"reason\":\"no-window\",\"url\":\"http://screen/\"}" {
		t.Fatalf("show = %s", got)
	}
}

// 読めないブックは、AI のブックの一覧に理由が付き、アクションはその理由で断る。プラグインを足せば読めるようになり、外せばまた理由が付く（データはそのまま）
func TestListsWhyABookCannotBeRead(t *testing.T) {
	s := newServer(t, nil)
	// ex2 を結んでいる間に書いたフローのブックは、ex2 を外すと読めなくなる（読めないブックは書けないので、結んでから書く）
	flow := `{"id":"f1","title":"Flow","lineup":[{"kind":"page","id":"p1","type":"ex2:flow","title":"P","paper":"@matomezu/base:a4","orientation":"portrait"}]}`
	if got := link(t, s, "../../test/added-plugins/ex2"); got != `{"id":"ex2","ok":true}` {
		t.Fatalf("link = %s", got)
	}
	if code, body := send(t, "PUT", s.URL+"/api/books-for-test/f1", `{"book":`+flow+`,"base":0}`, nil); code != 200 {
		t.Fatalf("put = %d %s", code, body)
	}
	if _, got := send(t, "POST", s.URL+"/api/plugins/remove", `{"id":"ex2"}`, ai); got != `{"ok":true}` {
		t.Fatalf("unlink = %s", got)
	}
	problem := func() string {
		_, body := get(t, s.URL+"/api/ai/books", "secret")
		var got struct {
			Books []struct {
				ID      string `json:"id"`
				Problem string `json:"problem"`
			} `json:"books"`
		}
		_ = json.Unmarshal([]byte(body), &got)
		for _, b := range got.Books {
			if b.ID == "f1" {
				return b.Problem
			}
		}
		return "missing"
	}
	if got := problem(); got != "W004 ex2: book f1 (Flow): it has a page of type ex2:flow, which is not in the catalog" {
		t.Fatalf("after unlinking = %q", got)
	}
	// 読めないブックへのアクションは「無い」でなく、その理由で断る
	page := `{"action":"@matomezu/base:page-add","args":{"type":"@matomezu/drawing:drawing","title":"p"},"on":{"book":"f1"}}`
	if _, got := send(t, "POST", s.URL+"/api/ai/perform", page, ai); got != `{"detail":"W004 ex2: book f1 (Flow): it has a page of type ex2:flow, which is not in the catalog","ok":false,"reason":"unreadable"}` {
		t.Fatalf("perform on an unreadable book = %s", got)
	}
	// 宛先がページでも同じ（そのページを持っているブックが読めない）。どのブックにも無いページは no-page
	lock := func(page string) string {
		_, got := send(t, "POST", s.URL+"/api/ai/perform", `{"action":"@matomezu/base:page-lock","args":{},"on":{"page":"`+page+`"}}`, ai)
		return got
	}
	if got := lock("p1"); got != `{"detail":"W004 ex2: book f1 (Flow): it has a page of type ex2:flow, which is not in the catalog","ok":false,"reason":"unreadable"}` {
		t.Fatalf("perform on a page of an unreadable book = %s", got)
	}
	if got := lock("gone"); !strings.Contains(got, `"reason":"no-page"`) || !strings.Contains(got, "there is no page with the id gone") {
		t.Fatalf("perform on a page that is nowhere = %s", got)
	}
	if got := link(t, s, "../../test/added-plugins/ex2"); got != `{"id":"ex2","ok":true}` {
		t.Fatalf("link again = %s", got)
	}
	if got := problem(); got != "" {
		t.Fatalf("after linking again = %q", got)
	}
	if _, got := send(t, "POST", s.URL+"/api/plugins/remove", `{"id":"ex2"}`, ai); got != `{"ok":true}` {
		t.Fatalf("unlink = %s", got)
	}
	if got := problem(); !strings.HasPrefix(got, "W004 ex2:") {
		t.Fatalf("after unlinking again = %q", got)
	}
}

// 一部のプラグインが無いだけのブックは読め、AI のブックの一覧には warning が付く（problem は付かない）
func TestListsAWarningForAPartlyKnownBook(t *testing.T) {
	s := newServer(t, nil)
	book := `{"id":"u1","title":"Stars","lineup":[{"kind":"page","id":"p1","type":"@matomezu/drawing:drawing","title":"P","paper":"@matomezu/base:a4","orientation":"landscape","items":[{"id":"s","item":"@foo/stars:star","x":0,"y":0,"props":{}}]}]}`
	if code, body := send(t, "PUT", s.URL+"/api/books-for-test/u1", `{"book":`+book+`,"base":0}`, nil); code != 200 {
		t.Fatalf("put = %d %s", code, body)
	}
	_, body := get(t, s.URL+"/api/ai/books", "secret")
	if !strings.Contains(body, `"warning":"W007 @foo/stars: book u1 (Stars): it has @foo/stars:star, not in the catalog (kept as they are)"`) || strings.Contains(body, `"problem"`) {
		t.Fatalf("books = %s", body)
	}
}

func TestWindowWarningsAreGatheredForAI(t *testing.T) {
	s := newServer(t, nil)
	a, b := listen(t, s.URL), listen(t, s.URL)
	next(t, a)
	next(t, b)
	auth := map[string]string{"Authorization": "Bearer secret"}
	catalog := func() string {
		_, body := send(t, "GET", s.URL+"/api/ai/catalog", "", auth)
		return body
	}
	if strings.Contains(catalog(), `"warnings"`) {
		t.Fatalf("catalog before = %s", catalog())
	}
	// 2 つの窓が同じ warning を知らせても 1 つ。表に無い番号は捨てる
	w011 := `{"code":"W011","plugin":"acme","params":{"reason":"E301"}}`
	send(t, "POST", s.URL+"/api/warnings", `{"client":"c1","warnings":[`+w011+`,{"code":"W999","plugin":"x","params":{}}]}`, nil)
	send(t, "POST", s.URL+"/api/warnings", `{"client":"c2","warnings":[`+w011+`]}`, nil)
	body := catalog()
	if strings.Count(body, "W011 acme: the screen did not add it (E301)") != 1 || strings.Contains(body, "W999") {
		t.Fatalf("catalog after = %s", body)
	}
	// 窓が warning は無いと知らせれば、その窓の分が消える（ほかの窓の分は残る）
	send(t, "POST", s.URL+"/api/warnings", `{"client":"c1","warnings":[]}`, nil)
	if !strings.Contains(catalog(), "W011 acme") {
		t.Fatalf("c2's warning is gone: %s", catalog())
	}
	send(t, "POST", s.URL+"/api/warnings", `{"client":"c2","warnings":[]}`, nil)
	if strings.Contains(catalog(), `"warnings"`) {
		t.Fatalf("catalog cleared = %s", catalog())
	}
	if code, _ := send(t, "POST", s.URL+"/api/warnings", `{"client":"c9","warnings":[]}`, nil); code != 404 {
		t.Fatalf("an unknown client = %d", code)
	}
	if code, _ := send(t, "POST", s.URL+"/api/warnings", `{"client":"c1","warnings":[]}`, map[string]string{"Origin": "https://evil.example"}); code != 403 {
		t.Fatalf("from another site = %d", code)
	}
}

func TestTouchedIsWhenABookWasOpenedOrWritten(t *testing.T) {
	s := newServer(t, nil)
	screen := listen(t, s.URL)
	next(t, screen)
	// 書くと、そのブックに触れた時刻を知らせ、/api/data にも出る
	send(t, "PUT", s.URL+"/api/books-for-test/b1", `{"book":`+drawing+`,"base":0}`, nil)
	if got := nextTouched(t, screen); !strings.Contains(got, `"book":"b1"`) {
		t.Fatalf("touched after writing = %s", got)
	}
	// 窓に新しく出たブックは開いた時刻を残す（DB に無いブックも）
	view := func(seq int, books ...string) {
		stages := ""
		for i, b := range books {
			if i > 0 {
				stages += ","
			}
			stages += fmt.Sprintf(`{"id":"s%d","book":"%s"}`, i+1, b)
		}
		send(t, "POST", s.URL+"/api/view", fmt.Sprintf(`{"client":"c1","view":{"book":"%s","stages":[%s]},"seq":%d}`, books[0], stages, seq), nil)
	}
	touched := func() map[string]string {
		_, body := send(t, "GET", s.URL+"/api/data", "", nil)
		var data struct {
			Touched map[string]string `json:"touched"`
		}
		if err := json.Unmarshal([]byte(body), &data); err != nil {
			t.Fatal(err)
		}
		return data.Touched
	}
	view(1, "b0", "b1")
	if got := nextTouched(t, screen); !strings.Contains(got, `"book":"b0"`) && !strings.Contains(got, `"book":"b1"`) {
		t.Fatalf("touched after opening = %s", got)
	}
	first := touched()
	if first["b0"] == "" || first["b1"] == "" {
		t.Fatalf("touched = %v", first)
	}
	// 出したままのブックは、ほかの知らせ（カレントの操作など）があっても開き直さない
	time.Sleep(5 * time.Millisecond)
	view(2, "b0", "b1")
	if got := touched(); got["b0"] != first["b0"] || got["b1"] != first["b1"] {
		t.Fatalf("kept on screen = %v; want %v", got, first)
	}
	// 一度消えてまた出たら、開き直した
	view(3, "b0")
	time.Sleep(5 * time.Millisecond)
	view(4, "b0", "b1")
	if got := touched(); got["b1"] <= first["b1"] || got["b0"] != first["b0"] {
		t.Fatalf("shown again = %v; was %v", got, first)
	}
}

// AI は、どこかの窓で利用者が直している物（locks）を変えも消しもできない（being-edited。中の物が変わっても断る）。
// ほかの物は変えられ、利用者は変えられる。窓が離れたら解ける
func TestAICannotChangeWhatTheUserIsEditing(t *testing.T) {
	s := newServer(t, nil)
	send(t, "PUT", s.URL+"/api/books-for-test/b1", `{"book":`+drawing+`,"base":0}`, nil)
	k1 := placeBox(t, s.URL, 10, "一")
	k2 := placeBox(t, s.URL, 300, "二")
	a := listen(t, s.URL)
	next(t, a)
	b := listen(t, s.URL)
	next(t, b)
	send(t, "POST", s.URL+"/api/view", `{"client":"c1","view":`+window+`,"focused":true,"seq":1}`, nil)
	send(t, "POST", s.URL+"/api/view", `{"client":"c2","view":`+window+`,"editLocks":{"b1":["`+k1+`"]},"seq":1}`, nil)
	update := func(item, caption string) string {
		return `{"action":"@matomezu/paper:item-update","args":{"item":"` + item + `","props":{"caption":"` + caption + `"}},"on":{"page":"p1"}}`
	}
	if _, got := send(t, "POST", s.URL+"/api/ai/perform", update(k1, "AI"), ai); got != `{"ok":false,"reason":"being-edited"}` {
		t.Fatalf("ai update of a locked thing = %s", got)
	}
	remove := `{"action":"@matomezu/paper:item-remove","args":{"items":["` + k1 + `"]},"on":{"page":"p1"}}`
	if _, got := send(t, "POST", s.URL+"/api/ai/perform", remove, ai); got != `{"ok":false,"reason":"being-edited"}` {
		t.Fatalf("ai remove of a locked thing = %s", got)
	}
	if _, got := send(t, "GET", s.URL+"/api/ai/books/b1", "", ai); !strings.Contains(got, `"caption":"一"`) {
		t.Fatalf("the locked thing changed: %s", got)
	}
	if _, got := send(t, "POST", s.URL+"/api/ai/perform", update(k2, "AI"), ai); !strings.HasPrefix(got, `{"ok":true`) {
		t.Fatalf("ai update of another thing = %s", got)
	}
	user := `{"action":"@matomezu/paper:item-update","args":{"item":"` + k1 + `","props":{"caption":"人"}},"on":{"page":"p1"},"lang":"ja","client":"c1","seq":1}`
	if _, got := send(t, "POST", s.URL+"/api/perform", user, nil); !strings.HasPrefix(got, `{"ok":true`) {
		t.Fatalf("user update of a locked thing = %s", got)
	}
	// 古い番号の知らせでは編集ロックは変わらない。新しい番号で外せば通る
	send(t, "POST", s.URL+"/api/view", `{"client":"c2","view":`+window+`,"seq":1}`, nil)
	if _, got := send(t, "POST", s.URL+"/api/ai/perform", update(k1, "AI"), ai); got != `{"ok":false,"reason":"being-edited"}` {
		t.Fatalf("ai update after a stale view = %s", got)
	}
	send(t, "POST", s.URL+"/api/view", `{"client":"c2","view":`+window+`,"seq":2}`, nil)
	if _, got := send(t, "POST", s.URL+"/api/ai/perform", update(k1, "AI"), ai); !strings.HasPrefix(got, `{"ok":true`) {
		t.Fatalf("ai update after unlocking = %s", got)
	}
}

// 窓が離れたら、その窓の編集ロックは解ける
func TestEditLocksGoWithTheWindow(t *testing.T) {
	s := newServer(t, nil)
	send(t, "PUT", s.URL+"/api/books-for-test/b1", `{"book":`+drawing+`,"base":0}`, nil)
	k1 := placeBox(t, s.URL, 10, "一")
	req, _ := http.NewRequest(http.MethodGet, s.URL+"/api/events", nil)
	req.Header.Set("Cookie", testCookie(s.URL))
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	sc := bufio.NewScanner(res.Body)
	for sc.Scan() && !strings.HasPrefix(sc.Text(), "data: ") {
	}
	send(t, "POST", s.URL+"/api/view", `{"client":"c1","view":`+window+`,"editLocks":{"b1":["`+k1+`"]},"seq":1}`, nil)
	remove := `{"action":"@matomezu/paper:item-remove","args":{"items":["` + k1 + `"]},"on":{"page":"p1"}}`
	if _, got := send(t, "POST", s.URL+"/api/ai/perform", remove, ai); got != `{"ok":false,"reason":"being-edited"}` {
		t.Fatalf("ai remove while locked = %s", got)
	}
	res.Body.Close()
	deadline := time.Now().Add(3 * time.Second)
	for {
		_, got := send(t, "POST", s.URL+"/api/ai/perform", remove, ai)
		if strings.HasPrefix(got, `{"ok":true`) {
			break
		}
		if time.Now().After(deadline) {
			t.Fatalf("ai remove after the window left = %s", got)
		}
		time.Sleep(20 * time.Millisecond)
	}
}

// placeBox は、ブック b1 のページ p1 の (x, 10) に、AI がキャプション caption の箱を置き、その id を返す
func placeBox(t *testing.T, url string, x int, caption string) string {
	t.Helper()
	return resultField(t, url, fmt.Sprintf(`{"action":"@matomezu/paper:item-place","args":{"item":"@matomezu/box:shape-nest-box","at":{"x":%d,"y":10},"props":{"caption":%q}},"on":{"page":"p1"}}`, x, caption), "item")
}

// 編集ロックはその物だけを見る: リストの行に編集ロックを掛けると、AI はその行を変えられないが、兄弟の行とリストのキャプションは変えられる
func TestEditLocksSeeOnlyTheLockedThing(t *testing.T) {
	s := newServer(t, nil)
	send(t, "PUT", s.URL+"/api/books-for-test/b1", `{"book":`+drawing+`,"base":0}`, nil)
	place := `{"action":"@matomezu/paper:item-place","args":{"item":"@matomezu/list:shape-list","at":{"x":10,"y":10},"props":{"caption":"L"}},"on":{"page":"p1"}}`
	list := resultField(t, s.URL, place, "item")
	row := func(caption string) string {
		return resultField(t, s.URL, `{"action":"@matomezu/list:row-add","args":{"list":"`+list+`","props":{"caption":"`+caption+`"}},"on":{"page":"p1"}}`, "row")
	}
	r1 := row("一")
	r2 := row("二")
	a := listen(t, s.URL)
	next(t, a)
	send(t, "POST", s.URL+"/api/view", `{"client":"c1","view":`+window+`,"editLocks":{"b1":["`+r1+`"]},"seq":1}`, nil)
	update := func(r string) string {
		return `{"action":"@matomezu/list:row-update","args":{"list":"` + list + `","row":"` + r + `","props":{"caption":"AI"}},"on":{"page":"p1"}}`
	}
	if _, got := send(t, "POST", s.URL+"/api/ai/perform", update(r1), ai); got != `{"ok":false,"reason":"being-edited"}` {
		t.Fatalf("ai update of the locked row = %s", got)
	}
	if _, got := send(t, "POST", s.URL+"/api/ai/perform", update(r2), ai); !strings.HasPrefix(got, `{"ok":true`) {
		t.Fatalf("ai update of a sibling row = %s", got)
	}
	caption := `{"action":"@matomezu/paper:item-update","args":{"item":"` + list + `","props":{"caption":"AI"}},"on":{"page":"p1"}}`
	if _, got := send(t, "POST", s.URL+"/api/ai/perform", caption, ai); !strings.HasPrefix(got, `{"ok":true`) {
		t.Fatalf("ai update of the list's caption = %s", got)
	}
}

// 置いたときのままの書き方（読み直すと既定が足される）のブックでも、編集ロックを掛けていない物を AI が変えれば通る
func TestEditLocksIgnoreDefaultsFilledOnRead(t *testing.T) {
	s := newServer(t, nil)
	book := `{"id":"b1","title":"T","lineup":[{"kind":"page","id":"p1","type":"@matomezu/drawing:drawing","title":"P","paper":"@matomezu/base:a4","orientation":"landscape","items":[` +
		`{"id":"k1","item":"@matomezu/box:shape-nest-box","x":10,"y":10,"props":{"caption":"一"}},` +
		`{"id":"k2","item":"@matomezu/box:shape-nest-box","x":300,"y":10,"props":{"caption":"二"}}]}]}`
	send(t, "PUT", s.URL+"/api/books-for-test/b1", `{"book":`+book+`,"base":0}`, nil)
	a := listen(t, s.URL)
	next(t, a)
	send(t, "POST", s.URL+"/api/view", `{"client":"c1","view":`+window+`,"editLocks":{"b1":["k1"]},"seq":1}`, nil)
	update := `{"action":"@matomezu/paper:item-update","args":{"item":"k2","props":{"caption":"AI"}},"on":{"page":"p1"}}`
	if _, got := send(t, "POST", s.URL+"/api/ai/perform", update, ai); !strings.HasPrefix(got, `{"ok":true`) {
		t.Fatalf("ai update of an unlocked thing = %s", got)
	}
}

// resultField は、AI がアクション req を行い、結果のフィールド name の値を返す
func resultField(t *testing.T, url, req, name string) string {
	t.Helper()
	_, got := send(t, "POST", url+"/api/ai/perform", req, ai)
	var done struct {
		Result map[string]any `json:"result"`
	}
	if json.Unmarshal([]byte(got), &done) != nil {
		t.Fatalf("%s = %s", req, got)
	}
	v, _ := done.Result[name].(string)
	if v == "" {
		t.Fatalf("%s = %s", req, got)
	}
	return v
}

func TestWriteLog(t *testing.T) {
	var out strings.Builder
	lines := []logLine{{At: "t0", Text: "dropped"}}
	for i := 0; i < maxLogLines-1; i++ {
		lines = append(lines, logLine{At: "t1", Text: "kept"})
	}
	lines = append(lines, logLine{At: "t2", Text: "lost the\nconnection " + strings.Repeat("x", maxLogText)})
	writeLog(&out, "c1", lines)
	got := strings.Split(strings.TrimSuffix(out.String(), "\n"), "\n")
	// 多すぎる分は古い方を捨て、改行は空白にし、長い行は切る
	if len(got) != maxLogLines || strings.Contains(out.String(), "dropped") {
		t.Fatalf("lines = %d: %s", len(got), out.String())
	}
	last := got[len(got)-1]
	if !strings.Contains(last, "window c1 at t2: lost the connection x") || !strings.HasSuffix(last, "x…") {
		t.Fatalf("last = %q", last)
	}
}

func TestWindowLog(t *testing.T) {
	s := newServer(t, nil)
	if code, _ := send(t, "POST", s.URL+"/api/log", `{"client":"c1","lines":[{"at":"t","text":"hi"}]}`, nil); code != 200 {
		t.Fatalf("code = %d", code)
	}
}

// 知らせが無いあいだも、窓に見える keep の知らせを送る（窓はこれが届かなければ、つながりが黙って切れたとみてつなぎ直す）
func TestEventsKeep(t *testing.T) {
	s := newServerWith(t, Options{Keep: 10 * time.Millisecond})
	lines := listen(t, s.URL)
	if l := next(t, lines); !strings.HasPrefix(l, "hello ") {
		t.Fatalf("first = %q", l)
	}
	if l := next(t, lines); l != "keep {}" {
		t.Fatalf("second = %q", l)
	}
}

// 変更提案郵便: AI が送ると AI 編集チケットができる。利用者の反映（proposal-apply）も、どこかの窓が直している物を変えるなら断る（being-edited）。
// 反映が失敗したと残すと、AI のフックが聞いたときに failed で渡る
func TestChangeProposal(t *testing.T) {
	s := newServer(t, nil)
	ai := joinedAI(t, s)
	send(t, "PUT", s.URL+"/api/books-for-test/b1", `{"book":`+drawing+`,"base":0}`, nil)
	k1 := placeBox(t, s.URL, 10, "一")
	a := listen(t, s.URL)
	next(t, a)
	send(t, "POST", s.URL+"/api/view", `{"client":"c1","view":`+window+`,"editLocks":{"b1":["`+k1+`"]},"seq":1}`, nil)
	change := `[{"action":"@matomezu/paper:item-update","args":{"item":"` + k1 + `","props":{"caption":"AI"}},"on":{"page":"p1"}}]`
	proposal := `{"action":"@matomezu/base:proposal-send","args":{"from":"E51","title":"名前","book":"b1","page":"p1","changes":` + change + `}}`
	_, got := send(t, "POST", s.URL+"/api/ai/perform", proposal, ai)
	var sent struct {
		OK     bool `json:"ok"`
		Result struct {
			Mail string `json:"mail"`
		} `json:"result"`
	}
	if json.Unmarshal([]byte(got), &sent) != nil || !sent.OK {
		t.Fatalf("proposal-send = %s", got)
	}
	_, data := send(t, "GET", s.URL+"/api/data", "", nil)
	var world struct {
		Records map[string]map[string]struct {
			Props struct {
				Snapshot json.RawMessage `json:"snapshot"`
			} `json:"props"`
		} `json:"records"`
	}
	// ほかは、参加の要求の郵便（joinedAI が受け入れた AI の分）
	if json.Unmarshal([]byte(data), &world) != nil || len(world.Records[mailKind]) != 2 || world.Records[mailKind][sent.Result.Mail].Props.Snapshot == nil {
		t.Fatalf("mail = %s", data)
	}
	apply := `{"action":"@matomezu/base:proposal-apply","args":{"page":"p1","changes":` + change + `,"snapshot":` + string(world.Records[mailKind][sent.Result.Mail].Props.Snapshot) + `},"on":{"book":"b1"},"lang":"ja","client":"c1","seq":1}`
	if _, got := send(t, "POST", s.URL+"/api/perform", apply, nil); got != `{"ok":false,"reason":"being-edited"}` {
		t.Fatalf("apply while the thing is being edited = %s", got)
	}
	// 編集ロックの無いアクションは、利用者なら通る
	user := `{"action":"@matomezu/paper:item-update","args":{"item":"` + k1 + `","props":{"caption":"人"}},"on":{"page":"p1"},"lang":"ja","client":"c1","seq":2}`
	if _, got := send(t, "POST", s.URL+"/api/perform", user, nil); !strings.HasPrefix(got, `{"ok":true`) {
		t.Fatalf("user update of a locked thing = %s", got)
	}
	settle := `{"action":"@matomezu/base:proposal-settle","args":{"outcome":"failed","changed":["` + k1 + `"]},"on":{"record":"` + sent.Result.Mail + `"},"lang":"ja","client":"c1","seq":3}`
	if _, got := send(t, "POST", s.URL+"/api/perform", settle, nil); !strings.HasPrefix(got, `{"ok":true`) {
		t.Fatalf("proposal-settle = %s", got)
	}
	want := `"failed":[{"book":"b1","title":"T","key":"` + sent.Result.Mail + `","changed":["` + k1 + `"]}]`
	if _, got := send(t, "GET", s.URL+"/api/ai/awaiting", "", ai); !strings.Contains(got, want) {
		t.Fatalf("awaiting = %s", got)
	}
}

func TestAIReadsABookAsAnOutlineAndAPageByItem(t *testing.T) {
	s := newServer(t, nil)
	box := func(id, caption string, children string) string {
		return `{"id":"` + id + `","x":10,"y":10,"item":"@matomezu/box:shape-nest-box","w":200,"h":100,"props":{"caption":"` + caption + `","rule":true,"body":"","captionAlign":"left","bodyAlign":"left"}` + children + `}`
	}
	nested := box("x1", "A", `,"shapes":[`+box("x2", "B", "")+`]`)
	body := `{"id":"b1","title":"T","lineup":[{"kind":"page","id":"p1","type":"@matomezu/drawing:drawing","title":"P","paper":"@matomezu/base:a4","orientation":"landscape","items":[` + nested + `,` + box("x3", "C", "") + `]}]}`
	send(t, "PUT", s.URL+"/api/books-for-test/b1", `{"book":`+body+`,"base":0}`, nil)
	ai := map[string]string{"Authorization": "Bearer secret"}

	// ブックは、ページの中身を除いた目次（kind・id・題名・タイプ・大きさ）
	_, got := send(t, "GET", s.URL+"/api/ai/books/b1?outline=1", "", ai)
	var book struct {
		Book struct {
			Title string                       `json:"title"`
			Pages []map[string]json.RawMessage `json:"lineup"`
		} `json:"book"`
	}
	if err := json.Unmarshal([]byte(got), &book); err != nil || book.Book.Title != "T" || len(book.Book.Pages) != 1 ||
		string(book.Book.Pages[0]["id"]) != `"p1"` || book.Book.Pages[0]["size"] == nil || book.Book.Pages[0]["items"] != nil || strings.Contains(got, `"caption"`) {
		t.Fatalf("book outline = %s", got)
	}

	// ページは、物の目次（id・種類・大きさ）
	_, got = send(t, "GET", s.URL+"/api/ai/books/b1/pages/p1?outline=1", "", ai)
	if !strings.Contains(got, `"id":"x1"`) || !strings.Contains(got, `"id":"x3"`) || strings.Contains(got, `"caption"`) || strings.Contains(got, `"id":"x2"`) {
		t.Fatalf("page outline = %s", got)
	}

	// 物を指すと、その物と中の物だけ（深さを問わない）。位置は中の物の分も
	_, got = send(t, "GET", s.URL+"/api/ai/books/b1/pages/p1?item=x1", "", ai)
	if !strings.Contains(got, `"caption":"A"`) || !strings.Contains(got, `"caption":"B"`) || strings.Contains(got, `"caption":"C"`) {
		t.Fatalf("item x1 = %s", got)
	}
	_, got = send(t, "GET", s.URL+"/api/ai/books/b1/pages/p1?item=x2", "", ai)
	if !strings.Contains(got, `"caption":"B"`) || strings.Contains(got, `"caption":"A"`) {
		t.Fatalf("nested item x2 = %s", got)
	}
	if code, _ := send(t, "GET", s.URL+"/api/ai/books/b1/pages/p1?item=nope", "", ai); code != 404 {
		t.Fatalf("an item that is not on the page = %d", code)
	}
	// 何も付けなければ、ブックの全部を返す
	_, got = send(t, "GET", s.URL+"/api/ai/books/b1", "", ai)
	if !strings.Contains(got, `"caption":"C"`) || !strings.Contains(got, `"placed"`) {
		t.Fatalf("whole book = %s", got)
	}
}

// 追加プラグインが足した対象の種類（ex9 のカード）のレコードを、AI が作る・直す・消す。窓には record の知らせが届き、/api/data にレコードと番号の表が載る
func TestRecordsOfAnAddedSubject(t *testing.T) {
	s := newServer(t, nil)
	ai := joinedAI(t, s)
	screen := listen(t, s.URL)
	next(t, screen) // hello
	if got := link(t, s, "../../test/added-plugins/ex9"); got != `{"id":"ex9","ok":true}` {
		t.Fatalf("link = %s", got)
	}
	next(t, screen) // plugins
	perform := func(body string) string {
		_, got := send(t, "POST", s.URL+"/api/ai/perform", body, ai)
		return got
	}
	made := perform(`{"action":"ex9:card-add","args":{"name":"apple"}}`)
	var created struct{ Result struct{ Card string } }
	if !strings.Contains(made, `"ok":true`) || json.Unmarshal([]byte(made), &created) != nil || created.Result.Card == "" || !strings.Contains(made, `"no":1`) {
		t.Fatalf("card-add = %s", made)
	}
	if got := next(t, screen); !strings.HasPrefix(got, "record ") || !strings.Contains(got, `"counters":{"ex9:card":{"all":2}}`) || !strings.Contains(got, `"id":"`+created.Result.Card+`"`) || !strings.Contains(got, `"subject":"ex9:card"`) {
		t.Fatalf("event = %s", got)
	}
	if got := perform(`{"action":"ex9:card-add","args":{"name":"apple"}}`); !strings.Contains(got, `"ok":false`) {
		t.Fatalf("a repeated name = %s", got)
	}
	if got := perform(`{"action":"ex9:card-rename","args":{"name":"pear"},"on":{"record":"` + created.Result.Card + `"}}`); !strings.Contains(got, `"ok":true`) {
		t.Fatalf("card-rename = %s", got)
	}
	next(t, screen) // record
	if got := perform(`{"action":"ex9:card-rename","args":{"name":"pear"},"on":{"record":"nothing"}}`); !strings.Contains(got, `"reason":"no-record"`) {
		t.Fatalf("rename of a record that is not there = %s", got)
	}
	_, data := send(t, "GET", s.URL+"/api/data", "", nil)
	if !strings.Contains(data, `"ex9:card":{"`+created.Result.Card+`":{"id":"`+created.Result.Card+`","name":"pear","no":1}}`) || !strings.Contains(data, `"ex9:card":{"all":2}`) {
		t.Fatalf("data = %s", data)
	}
	if got := perform(`{"action":"ex9:card-remove","args":{},"on":{"record":"` + created.Result.Card + `"}}`); !strings.Contains(got, `"ok":true`) {
		t.Fatalf("card-remove = %s", got)
	}
	if got := next(t, screen); !strings.Contains(got, `"record":"removed"`) {
		t.Fatalf("event = %s", got)
	}
	// 消しても、次の番号は戻らない
	if got := perform(`{"action":"ex9:card-add","args":{"name":"fig"}}`); !strings.Contains(got, `"no":2`) {
		t.Fatalf("card-add after removing = %s", got)
	}
}

// 窓が直しているレコード（recordLocks）を、AI のアクションは変えも消しもせず（being-edited）、窓を離れれば行える。新しく作るアクションは断らない
func TestRecordBeingEditedStopsAIActions(t *testing.T) {
	s := newServer(t, nil)
	ai := joinedAI(t, s)
	screen := listen(t, s.URL)
	next(t, screen) // hello
	if got := link(t, s, "../../test/added-plugins/ex9"); got != `{"id":"ex9","ok":true}` {
		t.Fatalf("link = %s", got)
	}
	next(t, screen) // plugins
	perform := func(body string) string {
		_, got := send(t, "POST", s.URL+"/api/ai/perform", body, ai)
		return got
	}
	made := perform(`{"action":"ex9:card-add","args":{"name":"apple"}}`)
	var created struct{ Result struct{ Card string } }
	if json.Unmarshal([]byte(made), &created) != nil || created.Result.Card == "" {
		t.Fatalf("card-add = %s", made)
	}
	next(t, screen) // record
	code, _ := send(t, "POST", s.URL+"/api/view", `{"client":"c1","view":{},"editLocks":{},"recordLocks":{"ex9:card":["`+created.Result.Card+`"]},"focused":true,"seq":1}`, nil)
	if code != 200 {
		t.Fatalf("view = %d", code)
	}
	rename := `{"action":"ex9:card-rename","args":{"name":"pear"},"on":{"record":"` + created.Result.Card + `"}}`
	if got := perform(rename); !strings.Contains(got, `"reason":"being-edited"`) {
		t.Fatalf("rename while editing = %s", got)
	}
	if got := perform(`{"action":"ex9:card-add","args":{"name":"fig"}}`); !strings.Contains(got, `"ok":true`) {
		t.Fatalf("a new card while editing = %s", got)
	}
}

// joinedAI は、参加が確定した AI（受け入れ済みで、join でセッション id を運んだので準備中でない）の合言葉と参加の id のヘッダ。
// ブックでない対象のアクションは、参加が確定するまで AI が使えない
func joinedAI(t *testing.T, s *httptest.Server) map[string]string {
	t.Helper()
	_, got := send(t, "POST", s.URL+"/api/ai/join", `{"ai":"claude","model":"opus","env":"wsl-linux","link":"JL","sessionId":"JS"}`, ai)
	var joined struct{ Participant string }
	if json.Unmarshal([]byte(got), &joined) != nil || joined.Participant == "" {
		t.Fatalf("join = %s", got)
	}
	if body := acceptRoom(t, s.URL, joined.Participant, "w"); !strings.Contains(body, `"ok":true`) {
		t.Fatalf("accept = %s", body)
	}
	header := map[string]string{"Authorization": "Bearer secret", ParticipantHeader: joined.Participant}
	send(t, "GET", s.URL+"/api/ai/books", "", header) // 最初の呼び出しの知らせ（participant-calls）を、窓をつなぐ前に済ませておく
	return header
}

// ブックでない対象のアクション（郵便を送るなど）を AI が使えるのは、参加が確定してから: 参加の id が無い・要求中・準備中（受け入れ済みでも、フックが参加を伝えるまで）は断り、確定すれば行える。ブックのアクションは参加を問わない
func TestAIActionsOfTheControlCenterNeedAConfirmedParticipation(t *testing.T) {
	s := newServer(t, nil)
	mail := `{"action":"@matomezu/base:mail-send","args":{"from":"x","title":"t"}}`
	refused := func(header map[string]string) bool {
		_, got := send(t, "POST", s.URL+"/api/ai/perform", mail, header)
		return strings.Contains(got, `"reason":"not-allowed"`) && strings.Contains(got, "not joined")
	}
	if !refused(ai) {
		t.Fatal("without a participant id, the action was not refused")
	}
	_, got := send(t, "POST", s.URL+"/api/ai/join", `{"ai":"claude","model":"opus","env":"wsl-linux","link":"L"}`, ai)
	var joined struct{ Participant string }
	if json.Unmarshal([]byte(got), &joined) != nil || joined.Participant == "" {
		t.Fatalf("join = %s", got)
	}
	header := map[string]string{"Authorization": "Bearer secret", ParticipantHeader: joined.Participant}
	if !refused(header) {
		t.Fatal("while requested, the action was not refused")
	}
	acceptRoom(t, s.URL, joined.Participant, "prep")
	if !refused(header) {
		t.Fatal("while preparing (accepted, the hook has not told), the action was not refused")
	}
	// ブックのアクションは、参加を問わない
	if _, got := send(t, "POST", s.URL+"/api/ai/perform", `{"action":"@matomezu/base:page-add","args":{"type":"@matomezu/drawing:drawing","title":"P"},"on":{"book":"nothing"}}`, ai); strings.Contains(got, "not joined") {
		t.Fatalf("a book action was stopped for the participation: %s", got)
	}
	// 参加が確定した AI は行える
	joinedHeader := joinedAI(t, s)
	if _, got := send(t, "POST", s.URL+"/api/ai/perform", mail, joinedHeader); !strings.Contains(got, `"ok":true`) {
		t.Fatalf("a confirmed participant = %s", got)
	}
}

// 最初のプロジェクトは 1 度だけ作る: 印が付いていれば、起動しても作らない
func TestFirstProjectIsMadeOnce(t *testing.T) {
	store, err := storage.OpenSQLite(filepath.Join(t.TempDir(), "data.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { store.Close() })
	if err := store.MarkRanOnce("@matomezu/taskboard:project-add"); err != nil {
		t.Fatal(err)
	}
	eng, err := engine.New()
	if err != nil {
		t.Fatal(err)
	}
	hub, err := NewHub(store, eng)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(hub.CloseAll)
	recs, err := store.Records()
	if err != nil {
		t.Fatal(err)
	}
	for _, r := range recs {
		if r.Subject == "@matomezu/taskboard:project" {
			t.Fatalf("project made again: %v", r)
		}
	}
}

// 追加プラグインは、足したときは無効で（画面は名乗りと文言だけで組み、エンジンはアクション・種類を AI にも出さない）、利用者が設定で有効にすると有効になる。
// 設定を変えると、ホストはエンジンを組み直し、窓に plugins を知らせる（窓は読み直す）
func TestAddedPluginsAreOffUntilEnabled(t *testing.T) {
	web := fstest.MapFS{"index.html": {Data: []byte("<!doctype html>top")}}
	store, err := storage.OpenSQLite(filepath.Join(t.TempDir(), "data.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { store.Close() })
	eng, err := engine.New()
	if err != nil {
		t.Fatal(err)
	}
	hub, err := NewHub(store, eng)
	if err != nil {
		t.Fatal(err)
	}
	o := Options{Web: web, Token: "secret", Version: "v1", Hub: hub, Cookies: NewScreenCookies(nil, nil)}
	s := httptest.NewUnstartedServer(withRoutesForTest(Handler(o), o))
	s.Config.RegisterOnShutdown(hub.CloseAll)
	s.Start()
	cookieTestBrowser(t, s, o.Cookies)
	t.Cleanup(hub.CloseAll)
	t.Cleanup(s.Close)
	screen := listen(t, s.URL)
	next(t, screen) // hello
	catalog := func() string { _, c := get(t, s.URL+"/api/ai/catalog", "secret"); return c }
	if got := link(t, s, "../../test/added-plugins/ex2"); got != `{"id":"ex2","ok":true}` {
		t.Fatalf("link = %s", got)
	}
	if got := next(t, screen); got != `plugins {"version":1}` {
		t.Fatalf("event = %s", got)
	}
	if _, body := send(t, "GET", s.URL+"/api/data", "", nil); !strings.Contains(body, `"id":"ex2","ui":"api/plugins/0/ui.js?v=1","disabled":true`) {
		t.Fatalf("a plugin that was just added is not marked off: %s", body)
	}
	if c := catalog(); strings.Contains(c, `ex2:diamond`) {
		t.Fatalf("an off plugin shows up in the AI catalog: %s", c)
	}
	// 有効にすると、組み直して窓に知らせる
	set := func(ids string) {
		send(t, "POST", s.URL+"/api/perform", `{"action":"@matomezu/base:settings-set","args":{"values":{"`+enabledPluginsSetting+`":`+ids+`}},"lang":"ja","client":"c1","seq":1}`, nil)
	}
	set(`["ex2"]`)
	next(t, screen) // settings
	if got := next(t, screen); got != `plugins {"version":2}` {
		t.Fatalf("event after enabling = %s", got)
	}
	next(t, screen) // ack
	if c := catalog(); !strings.Contains(c, `ex2:diamond`) {
		t.Fatalf("the enabled plugin is not in the AI catalog")
	}
	if _, body := send(t, "GET", s.URL+"/api/data", "", nil); strings.Contains(body, `"disabled":true`) {
		t.Fatalf("an enabled plugin is marked off: %s", body)
	}
	// 設定がほかの項目だけ変わっても、組み直さない
	send(t, "POST", s.URL+"/api/perform", `{"action":"@matomezu/base:settings-set","args":{"values":{"@matomezu/base:skin":"@matomezu/base:dark"}},"lang":"ja","client":"c1","seq":2}`, nil)
	next(t, screen) // settings
	next(t, screen) // ack
	// 無効に戻すと、また組み直す
	set(`[]`)
	next(t, screen) // settings
	if got := next(t, screen); got != `plugins {"version":3}` {
		t.Fatalf("event after disabling = %s", got)
	}
}
