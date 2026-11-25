package server

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"testing/fstest"

	"github.com/umaxyon/matomezu/internal/engine"
)

// 利用者が打つ名前は、画面の index.html の meta（画面 cookie が無くても読める）と、参加の手順・更新を頼む文に入る。渡されなければ matomezu
func TestTheCommandGoesToTheScreenAndTheAI(t *testing.T) {
	eng, err := engine.New()
	if err != nil {
		t.Fatal(err)
	}
	hub, err := NewHub(joinStore(t), eng)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(hub.CloseAll)
	if hub.Command() != "matomezu" {
		t.Fatalf("default = %q", hub.Command())
	}
	hub.SetCommand("matomezu.cmd")
	web := fstest.MapFS{"index.html": {Data: []byte("<html><head><title>m</title></head></html>")}, "a.js": {Data: []byte("js")}}
	s := httptest.NewServer(Handler(Options{Web: web, Token: "secret", Version: "v1", Hub: hub, Cookies: NewScreenCookies(nil, nil)}))
	t.Cleanup(s.Close)
	for _, path := range []string{"/", "/index.html"} {
		res, err := http.Get(s.URL + path)
		if err != nil {
			t.Fatal(err)
		}
		b, err := io.ReadAll(res.Body)
		res.Body.Close()
		if err != nil || !strings.Contains(string(b), `<meta name="matomezu-command" content="matomezu.cmd" />`) {
			t.Fatalf("%s = %q, %v", path, b, err)
		}
	}
	if res, err := http.Get(s.URL + "/a.js"); err != nil || res.StatusCode != http.StatusOK {
		t.Fatalf("a.js = %v, %v", res, err)
	}
	rules, _ := call(t, "GET", s.URL+"/api/ai/join-rules", "", nil)
	var reply struct {
		Rules string `json:"rules"`
	}
	if err := json.Unmarshal([]byte(rules), &reply); err != nil || !strings.Contains(reply.Rules, "run matomezu.cmd open") {
		t.Fatalf("join rules = %s", rules)
	}
	if line := askUpdateLine(hub.Command()); !strings.Contains(line, `"matomezu.cmd update"`) || !strings.Contains(line, asUserMark) {
		t.Fatalf("line = %q", line)
	}
}
