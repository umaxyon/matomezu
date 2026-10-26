package server

import (
	"bufio"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
	"testing/fstest"
	"time"

	"github.com/umaxyon/matomezu/internal/engine"
	"github.com/umaxyon/matomezu/internal/storage"
)

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
	hub, err := NewHub(store, eng)
	if err != nil {
		t.Fatal(err)
	}
	o.Web, o.Token, o.Version, o.Hub = web, "secret", "v1", hub
	s := httptest.NewUnstartedServer(Handler(o))
	s.Config.RegisterOnShutdown(hub.CloseAll)
	s.Start()
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

// send は画面からの頼みを送る（headers の Origin などはそのまま付ける）
func send(t *testing.T, method, url, body string, headers map[string]string) (int, string) {
	t.Helper()
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
	screen := listen(t, s.URL)
	next(t, screen) // hello
	catalog := func() string { _, c := get(t, s.URL+"/api/ai/catalog", "secret"); return c }
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
	made := perform(`{"action":"@matomezu/base:book-create","args":{"title":"F","type":"ex2:flow"}}`)
	if !strings.Contains(made, `"ok":true`) {
		t.Fatalf("@matomezu/base:book-create = %s", made)
	}
	var created struct{ Result struct{ Book string } }
	_ = json.Unmarshal([]byte(made), &created)
	next(t, screen) // book
	if got := perform(`{"action":"@matomezu/base:page-add","args":{"title":"P"},"on":{"book":"` + created.Result.Book + `"}}`); !strings.Contains(got, `"ok":true`) {
		t.Fatalf("@matomezu/base:page-add = %s", got)
	}
	next(t, screen) // book
	_, read := get(t, s.URL+"/api/ai/books/"+created.Result.Book, "secret")
	var book struct {
		Book struct{ Pages []struct{ ID string } }
	}
	if json.Unmarshal([]byte(read), &book) != nil || len(book.Book.Pages) == 0 {
		t.Fatalf("book = %s", read)
	}
	place := `{"action":"@matomezu/paper:item-place","args":{"page":"` + book.Book.Pages[0].ID + `","item":"ex2:diamond","at":{"x":40,"y":40},"props":{"caption":"D"}},"on":{"book":"` + created.Result.Book + `"}}`
	if got := perform(place); !strings.Contains(got, `"ok":true`) {
		t.Fatalf("place = %s", got)
	}
	next(t, screen) // book

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
	if c := catalog(); !strings.Contains(c, `"w":123`) || strings.Count(c, `"id":"ex2:diamond"`) != 1 {
		t.Fatalf("catalog after replacing = %s", c)
	}
	if got := perform(place); !strings.Contains(got, `"ok":true`) {
		t.Fatalf("place after replacing = %s", got)
	}
	next(t, screen) // book

	// 組み立てられないものを足しても、前のまま動き続ける
	broken := copyDir(t, flow, func(name, text string) string {
		return strings.ReplaceAll(text, `items: [DIAMOND]`, `items: [DIAMOND, DIAMOND]`)
	})
	if got := link(t, s, broken); !strings.Contains(got, `"ok":false`) {
		t.Fatalf("link a broken plugin = %s", got)
	}
	if c := catalog(); !strings.Contains(c, `"w":123`) {
		t.Fatalf("catalog after a refused plugin = %s", c)
	}
	if got := perform(place); !strings.Contains(got, `"ok":true`) {
		t.Fatalf("place after a refused plugin = %s", got)
	}
	next(t, screen) // book

	// 外す: そのタイプのブックではアクションを断り、ほかは動く
	if _, got := send(t, "POST", s.URL+"/api/plugins/remove", `{"id":"ex2"}`, ai); got != `{"ok":true}` {
		t.Fatalf("remove = %s", got)
	}
	if got := next(t, screen); got != `plugins {"version":3}` {
		t.Fatalf("event = %s", got)
	}
	if c := catalog(); strings.Contains(c, "ex2") {
		t.Fatalf("catalog after removing = %s", c)
	}
	if got := perform(place); strings.Contains(got, `"ok":true`) {
		t.Fatalf("place after removing = %s", got)
	}
	if got := perform(`{"action":"@matomezu/base:book-create","args":{"title":"D","type":"@matomezu/drawing:drawing"}}`); !strings.Contains(got, `"ok":true`) {
		t.Fatalf("@matomezu/base:book-create drawing = %s", got)
	}
	if _, got := send(t, "POST", s.URL+"/api/plugins/remove", `{"id":"ex2"}`, ai); !strings.Contains(got, `"ok":false`) {
		t.Fatalf("remove again = %s", got)
	}
}

func TestBooksAreKeptWithVersions(t *testing.T) {
	s := newServer(t, nil)
	if code, body := send(t, "GET", s.URL+"/api/data", "", nil); code != 200 || body != `{"books":[],"plugins":[],"settings":null}` {
		t.Fatalf("empty data = %d %s", code, body)
	}
	book := func(title string) string {
		return `{"type":"@matomezu/drawing:drawing","id":"b1","title":"` + title + `","pages":[]}`
	}
	put := func(title string, base int) (int, string) {
		return send(t, "PUT", s.URL+"/api/books/b1", `{"book":`+book(title)+`,"base":`+strconv.Itoa(base)+`}`, nil)
	}
	if code, body := put("A", 0); code != 200 || body != `{"version":1}` {
		t.Fatalf("add = %d %s", code, body)
	}
	if code, body := put("B", 1); code != 200 || body != `{"version":2}` {
		t.Fatalf("update = %d %s", code, body)
	}
	if code, body := put("C", 1); code != 409 || body != `{"id":"b1","book":`+book("B")+`,"version":2}` {
		t.Fatalf("stale update = %d %s", code, body)
	}
	if code, _ := send(t, "PUT", s.URL+"/api/books/b1", `{"book":{"id":"b2"},"base":2}`, nil); code != 400 {
		t.Fatalf("a book of another id = %d", code)
	}
	// 読めないブック（形に合わない・タイプが無い）は書かず、理由を返す
	if code, body := send(t, "PUT", s.URL+"/api/books/b1", `{"book":{"id":"b1","title":"X"},"base":2}`, nil); code != 400 || !strings.HasPrefix(body, "unreadable: N004") {
		t.Fatalf("a book without a type = %d %s", code, body)
	}
	if code, body := send(t, "PUT", s.URL+"/api/books/b1", `{"book":{"type":"@matomezu/drawing:drawing","id":"b1","title":"X"},"base":2}`, nil); code != 400 || !strings.HasPrefix(body, "unreadable: N005") {
		t.Fatalf("a book that does not fit its type = %d %s", code, body)
	}
	want := `{"books":[{"id":"b1","book":` + book("B") + `,"version":2}],"plugins":[],"settings":null}`
	if code, body := send(t, "GET", s.URL+"/api/data", "", nil); code != 200 || body != want {
		t.Fatalf("data = %d %s", code, body)
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
	res, _ := http.DefaultClient.Do(req)
	res.Body.Close()
	if res.StatusCode != 415 {
		t.Errorf("a body that is not JSON = %d; want 415", res.StatusCode)
	}
}

const drawing = `{"type":"@matomezu/drawing:drawing","id":"b1","title":"T","pages":[{"id":"p1","title":"P","paper":"@matomezu/base:a4","orientation":"landscape"}]}`

// listen は /api/events につなぎ、届いたイベントを「名前 data」の行で返す通り道
func listen(t *testing.T, url string) <-chan string {
	t.Helper()
	res, err := http.Get(url + "/api/events")
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

func next(t *testing.T, lines <-chan string) string {
	t.Helper()
	select {
	case l := <-lines:
		return l
	case <-time.After(3 * time.Second):
		t.Fatal("no event")
		return ""
	}
}

func TestPerformTellsEveryScreen(t *testing.T) {
	s := newServer(t, nil)
	send(t, "PUT", s.URL+"/api/books/b1", `{"book":`+drawing+`,"base":0}`, nil)
	a, b := listen(t, s.URL), listen(t, s.URL)
	if got := next(t, a); got != `hello {"client":"c1"}` {
		t.Fatalf("a hello = %s", got)
	}
	next(t, b)
	code, body := send(t, "POST", s.URL+"/api/perform",
		`{"action":"@matomezu/paper:item-place","args":{"page":"p1","item":"@matomezu/box:shape-box","at":{"x":1,"y":2}},"on":{"book":"b1"},"lang":"ja","ids":["k1"],"client":"c1","seq":7}`, nil)
	if code != 200 || body != `{"ok":true,"result":{"item":"k1"}}` {
		t.Fatalf("perform = %d %s", code, body)
	}
	for name, lines := range map[string]<-chan string{"a": a, "b": b} {
		got := next(t, lines)
		if !strings.HasPrefix(got, `book {"book":{`) || !strings.Contains(got, `"id":"k1"`) || !strings.HasSuffix(got, `"client":"c1","seq":7,"version":2}`) {
			t.Fatalf("%s book = %s", name, got)
		}
	}
	if got := next(t, a); got != `ack {"ok":true,"reason":"","seq":7}` {
		t.Fatalf("a ack = %s", got)
	}
	_, data := send(t, "GET", s.URL+"/api/data", "", nil)
	if !strings.Contains(data, `"id":"k1"`) || !strings.Contains(data, `"version":2`) {
		t.Fatalf("data = %s", data)
	}
}

func TestRefusedActionChangesNothing(t *testing.T) {
	s := newServer(t, nil)
	send(t, "PUT", s.URL+"/api/books/b1", `{"book":`+drawing+`,"base":0}`, nil)
	a := listen(t, s.URL)
	next(t, a)
	code, body := send(t, "POST", s.URL+"/api/perform",
		`{"action":"@matomezu/paper:item-update","args":{"page":"p1","item":"gone","props":{}},"on":{"book":"b1"},"lang":"ja","client":"c1","seq":1}`, nil)
	if code != 200 || body != `{"ok":false,"reason":"refused"}` {
		t.Fatalf("perform = %d %s", code, body)
	}
	if got := next(t, a); got != `ack {"ok":false,"reason":"refused","seq":1}` {
		t.Fatalf("ack = %s", got)
	}
}

func TestSettingsActions(t *testing.T) {
	s := newServer(t, nil)
	a := listen(t, s.URL)
	next(t, a)
	send(t, "POST", s.URL+"/api/perform", `{"action":"@matomezu/base:settings-skin","args":{"skin":"@matomezu/base:dark"},"lang":"ja"}`, nil)
	if got := next(t, a); !strings.HasPrefix(got, `settings {`) || !strings.Contains(got, `"skin":"@matomezu/base:dark"`) {
		t.Fatalf("settings = %s", got)
	}
	_, data := send(t, "GET", s.URL+"/api/data", "", nil)
	if !strings.Contains(data, `"skin":"@matomezu/base:dark"`) {
		t.Fatalf("data = %s", data)
	}
	// AI も設定を読んで変えられる
	if _, got := send(t, "GET", s.URL+"/api/ai/settings", "", ai); !strings.Contains(got, `"skin":"@matomezu/base:dark"`) {
		t.Fatalf("ai settings = %s", got)
	}
	if _, got := send(t, "POST", s.URL+"/api/ai/perform", `{"action":"@matomezu/base:settings-skin","args":{"skin":"@matomezu/base:light"}}`, ai); got != `{"ok":true,"result":{}}` {
		t.Fatalf("ai perform = %s", got)
	}
}

func TestViewIsTheLastFocusedScreens(t *testing.T) {
	s := newServer(t, nil)
	a, b := listen(t, s.URL), listen(t, s.URL)
	next(t, a)
	next(t, b)
	ai := func() string {
		_, body := send(t, "GET", s.URL+"/api/ai/view", "", map[string]string{"Authorization": "Bearer secret"})
		return body
	}
	if got := ai(); got != "null" {
		t.Fatalf("view before any report = %s", got)
	}
	send(t, "POST", s.URL+"/api/view", `{"client":"c1","view":{"book":"A"},"focused":true}`, nil)
	send(t, "POST", s.URL+"/api/view", `{"client":"c2","view":{"book":"B"}}`, nil)
	if got := ai(); got != `{"book":"A"}` {
		t.Fatalf("view = %s; want the focused screen's", got)
	}
	send(t, "POST", s.URL+"/api/view", `{"client":"c2","focused":true}`, nil)
	if got := ai(); got != `{"book":"B"}` {
		t.Fatalf("view after c2 is focused = %s", got)
	}
	if code, _ := send(t, "POST", s.URL+"/api/view", `{"client":"c9"}`, nil); code != 404 {
		t.Fatalf("an unknown client = %d", code)
	}
}

func TestAIEntrancesNeedTheToken(t *testing.T) {
	s := newServer(t, nil)
	send(t, "PUT", s.URL+"/api/books/b1", `{"book":`+drawing+`,"base":0}`, nil)
	auth := map[string]string{"Authorization": "Bearer secret"}
	for _, path := range []string{"/api/ai/view", "/api/ai/books", "/api/ai/books/b1", "/api/ai/settings", "/api/ai/catalog"} {
		if code, _ := send(t, "GET", s.URL+path, "", nil); code != 401 {
			t.Errorf("%s without the token = %d", path, code)
		}
	}
	if _, body := send(t, "GET", s.URL+"/api/ai/books", "", auth); body != `{"books":[{"id":"b1","type":"@matomezu/drawing:drawing","title":"T","version":1}]}` {
		t.Fatalf("books = %s", body)
	}
	code, body := send(t, "POST", s.URL+"/api/ai/perform", `{"action":"@matomezu/base:page-add","args":{"title":"Two"},"on":{"book":"b1"}}`, auth)
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
	send(t, "PUT", s.URL+"/api/books/b1", `{"book":`+drawing+`,"base":0}`, nil)
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
	select {
	case l := <-a:
		t.Fatalf("a window not focused last got %s", l)
	default:
	}
}

func TestShowOpensABrowserWhenNoWindowIsThere(t *testing.T) {
	var s *httptest.Server
	opened := make(chan (<-chan string), 1)
	s = newServerWith(t, Options{URL: "http://screen/", Open: func() error {
		go func() {
			lines := listen(t, s.URL)
			<-lines // hello
			send(t, "POST", s.URL+"/api/view", `{"client":"c1","view":`+window+`,"focused":true}`, nil)
			opened <- lines
		}()
		return nil
	}})
	send(t, "PUT", s.URL+"/api/books/b1", `{"book":`+drawing+`,"base":0}`, nil)
	auth := map[string]string{"Authorization": "Bearer secret"}
	if _, got := send(t, "POST", s.URL+"/api/ai/show", `{"book":"b1","split":true}`, auth); got != "{\"ok\":true,\"opened\":true}" {
		t.Fatalf("show = %s", got)
	}
	if got := next(t, <-opened); got != `show {"book":"b1","split":true}` {
		t.Fatalf("the opened window got %s", got)
	}
}

func TestShowWithoutAWindowNorABrowser(t *testing.T) {
	s := newServerWith(t, Options{URL: "http://screen/", Wait: 50 * time.Millisecond, Open: func() error { return nil }})
	send(t, "PUT", s.URL+"/api/books/b1", `{"book":`+drawing+`,"base":0}`, nil)
	auth := map[string]string{"Authorization": "Bearer secret"}
	if _, got := send(t, "POST", s.URL+"/api/ai/show", `{"book":"b1"}`, auth); got != "{\"ok\":false,\"reason\":\"no-window\",\"url\":\"http://screen/\"}" {
		t.Fatalf("show = %s", got)
	}
}

// 読めないブックは、AI のブックの一覧に理由が付き、アクションはその理由で断る。プラグインを足せば読めるようになり、外せばまた理由が付く（データはそのまま）
func TestListsWhyABookCannotBeRead(t *testing.T) {
	s := newServer(t, nil)
	// ex2 を結んでいる間に書いたフローのブックは、ex2 を外すと読めなくなる（読めないブックは書けないので、結んでから書く）
	flow := `{"type":"ex2:flow","id":"f1","title":"Flow","pages":[]}`
	if got := link(t, s, "../../test/added-plugins/ex2"); got != `{"id":"ex2","ok":true}` {
		t.Fatalf("link = %s", got)
	}
	if code, body := send(t, "PUT", s.URL+"/api/books/f1", `{"book":`+flow+`,"base":0}`, nil); code != 200 {
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
	if got := problem(); got != "N004 ex2: book f1 (Flow): its type ex2:flow is not in the catalog" {
		t.Fatalf("after unlinking = %q", got)
	}
	// 読めないブックへのアクションは「無い」でなく、その理由で断る
	page := `{"action":"@matomezu/base:page-add","args":{"title":"p"},"on":{"book":"f1"}}`
	if _, got := send(t, "POST", s.URL+"/api/ai/perform", page, ai); got != `{"detail":"N004 ex2: book f1 (Flow): its type ex2:flow is not in the catalog","ok":false,"reason":"unreadable"}` {
		t.Fatalf("perform on an unreadable book = %s", got)
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
	if got := problem(); !strings.HasPrefix(got, "N004 ex2:") {
		t.Fatalf("after unlinking again = %q", got)
	}
}

// 一部のプラグインが無いだけのブックは読め、AI のブックの一覧には notice が付く（problem は付かない）
func TestListsANoticeForAPartlyKnownBook(t *testing.T) {
	s := newServer(t, nil)
	book := `{"type":"@matomezu/drawing:drawing","id":"u1","title":"Stars","pages":[{"id":"p1","title":"P","paper":"@matomezu/base:a4","orientation":"landscape","items":[{"id":"s","item":"@foo/stars:star","x":0,"y":0,"props":{}}]}]}`
	if code, body := send(t, "PUT", s.URL+"/api/books/u1", `{"book":`+book+`,"base":0}`, nil); code != 200 {
		t.Fatalf("put = %d %s", code, body)
	}
	_, body := get(t, s.URL+"/api/ai/books", "secret")
	if !strings.Contains(body, `"notice":"N007 @foo/stars: book u1 (Stars): it has @foo/stars:star, not in the catalog (kept as they are)"`) || strings.Contains(body, `"problem"`) {
		t.Fatalf("books = %s", body)
	}
}
