package server

import (
	"io"
	"net/http"
	"net/http/httptest"
	"testing"
	"testing/fstest"
)

func newServer(t *testing.T, stop func()) *httptest.Server {
	web := fstest.MapFS{
		"index.html": {Data: []byte("<!doctype html>top")},
		"app.js":     {Data: []byte("js")},
	}
	s := httptest.NewServer(Handler(Options{Web: web, Token: "secret", Version: "v1", Stop: stop}))
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
