package server

import (
	"bufio"
	"io"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"
	"testing/fstest"
	"time"

	"github.com/umaxyon/matomezu/internal/engine"
	"github.com/umaxyon/matomezu/internal/storage"
)

func newServer(t *testing.T, stop func()) *httptest.Server {
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
	s := httptest.NewUnstartedServer(Handler(Options{Web: web, Token: "secret", Version: "v1", Stop: stop, Hub: hub}))
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

func TestBooksAreKeptWithVersions(t *testing.T) {
	s := newServer(t, nil)
	if code, body := send(t, "GET", s.URL+"/api/data", "", nil); code != 200 || body != `{"books":[],"settings":null}` {
		t.Fatalf("empty data = %d %s", code, body)
	}
	if code, body := send(t, "PUT", s.URL+"/api/books/b1", `{"book":{"id":"b1","title":"A"},"base":0}`, nil); code != 200 || body != `{"version":1}` {
		t.Fatalf("add = %d %s", code, body)
	}
	if code, body := send(t, "PUT", s.URL+"/api/books/b1", `{"book":{"id":"b1","title":"B"},"base":1}`, nil); code != 200 || body != `{"version":2}` {
		t.Fatalf("update = %d %s", code, body)
	}
	code, body := send(t, "PUT", s.URL+"/api/books/b1", `{"book":{"id":"b1","title":"C"},"base":1}`, nil)
	if code != 409 || body != `{"id":"b1","book":{"id":"b1","title":"B"},"version":2}` {
		t.Fatalf("stale update = %d %s", code, body)
	}
	if code, _ := send(t, "PUT", s.URL+"/api/books/b1", `{"book":{"id":"b2"},"base":2}`, nil); code != 400 {
		t.Fatalf("a book of another id = %d", code)
	}
	want := `{"books":[{"id":"b1","book":{"id":"b1","title":"B"},"version":2}],"settings":null}`
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

const drawing = `{"type":"drawing","id":"b1","title":"T","pages":[{"id":"p1","title":"P","paper":"a4","orientation":"landscape"}]}`

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
		`{"action":"item.place","args":{"page":"p1","item":"shape.box","at":{"x":1,"y":2}},"on":{"book":"b1"},"lang":"ja","ids":["k1"],"client":"c1","seq":7}`, nil)
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
		`{"action":"item.update","args":{"page":"p1","item":"gone","props":{}},"on":{"book":"b1"},"lang":"ja","client":"c1","seq":1}`, nil)
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
	send(t, "POST", s.URL+"/api/perform", `{"action":"settings.skin","args":{"skin":"dark"},"lang":"ja"}`, nil)
	if got := next(t, a); !strings.HasPrefix(got, `settings {`) || !strings.Contains(got, `"skin":"dark"`) {
		t.Fatalf("settings = %s", got)
	}
	_, data := send(t, "GET", s.URL+"/api/data", "", nil)
	if !strings.Contains(data, `"skin":"dark"`) {
		t.Fatalf("data = %s", data)
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
	for _, path := range []string{"/api/ai/view", "/api/ai/books", "/api/ai/books/b1", "/api/ai/catalog"} {
		if code, _ := send(t, "GET", s.URL+path, "", nil); code != 401 {
			t.Errorf("%s without the token = %d", path, code)
		}
	}
	if _, body := send(t, "GET", s.URL+"/api/ai/books", "", auth); body != `{"books":[{"id":"b1","type":"drawing","title":"T","version":1}]}` {
		t.Fatalf("books = %s", body)
	}
	code, body := send(t, "POST", s.URL+"/api/ai/perform", `{"action":"page.add","args":{"title":"Two"},"on":{"book":"b1"}}`, auth)
	if code != 200 || !strings.HasPrefix(body, `{"ok":true,"result":{"page":"`) {
		t.Fatalf("perform = %d %s", code, body)
	}
	if _, body := send(t, "GET", s.URL+"/api/ai/books/b1", "", auth); !strings.Contains(body, `"title":"Two"`) || !strings.Contains(body, `"version":2`) {
		t.Fatalf("book = %s", body)
	}
}
