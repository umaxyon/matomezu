package server

import (
	"io"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"
	"testing/fstest"

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
	s := httptest.NewServer(Handler(Options{Web: web, Token: "secret", Version: "v1", Stop: stop, Storage: store}))
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
	if code, _ := send(t, "PUT", s.URL+"/api/settings", `{"lang":"en"}`, nil); code != 200 {
		t.Fatalf("settings = %d", code)
	}
	want := `{"books":[{"id":"b1","book":{"id":"b1","title":"B"},"version":2}],"settings":{"lang":"en"}}`
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
		req, _ := http.NewRequest("PUT", s.URL+"/api/settings", strings.NewReader(`{}`))
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
	req, _ := http.NewRequest("PUT", s.URL+"/api/settings", strings.NewReader(`{}`))
	req.Header.Set("Content-Type", "text/plain")
	res, _ := http.DefaultClient.Do(req)
	res.Body.Close()
	if res.StatusCode != 415 {
		t.Errorf("a body that is not JSON = %d; want 415", res.StatusCode)
	}
}
