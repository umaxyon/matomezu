package server

import (
	"net/http"
	"net/url"
	"strings"
	"testing"
	"time"
)

// 画面からの入口は、ペアを組んでいないブラウザ（cookie が無い・違う）には、どれも断る（reset-for-test などテストの用意の入口は対象外）
func TestScreenRoutesNeedThePairedBrowser(t *testing.T) {
	s := newServer(t, nil)
	routes := []struct{ method, path, body string }{
		{"GET", "/api/data", ""},
		{"GET", "/api/events", ""},
		{"GET", "/api/plugins/0/ui.js", ""},
		{"POST", "/api/perform", `{}`},
		{"POST", "/api/view", `{}`},
		{"POST", "/api/warnings", `{}`},
		{"POST", "/api/log", `{}`},
		{"POST", "/api/ai-edit-tickets", `{}`},
	}
	for _, r := range routes {
		for name, cookie := range map[string]string{"no cookie": "", "wrong key": strings.Split(pairedCookie(s.URL), "=")[0] + "=nope"} {
			if code, body := send(t, r.method, s.URL+r.path, r.body, map[string]string{"Cookie": cookie}); code != 403 || body != "pair-required" {
				t.Errorf("%s %s (%s) = %d %q; want 403 pair-required", r.method, r.path, name, code, body)
			}
		}
		if r.path == "/api/events" {
			continue // ペア済みなら、つながったまま返らない（つながることは、ほかのテストが確かめている）
		}
		if code, _ := send(t, r.method, s.URL+r.path, r.body, nil); code == 403 {
			t.Errorf("%s %s with the paired key = 403", r.method, r.path)
		}
	}
	// 合言葉の入口は、ペアと関係なく合言葉で通る
	if code, _ := get(t, s.URL+"/api/ping", "secret"); code != 200 {
		t.Errorf("ping = %d", code)
	}
}

// コードは 1 度だけ使え、期限が切れたら使えない。使うと鍵が cookie（HttpOnly・SameSite=Strict）に置かれ、その鍵で通る
func TestPairCodeIsUsedOnceAndExpires(t *testing.T) {
	p := NewPairing(nil, nil)
	now := time.Date(2026, 11, 9, 0, 0, 0, 0, time.UTC)
	p.now = func() time.Time { return now }
	s := newServerWith(t, Options{Pair: p})
	noRedirect := &http.Client{CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}
	pair := func(code string) *http.Response {
		res, err := noRedirect.Get(s.URL + "/pair?code=" + url.QueryEscape(code))
		if err != nil {
			t.Fatal(err)
		}
		res.Body.Close()
		return res
	}

	code := p.NewCode()
	res := pair(code)
	if res.StatusCode != http.StatusSeeOther || res.Header.Get("Location") != "/" {
		t.Fatalf("pair = %d %s", res.StatusCode, res.Header.Get("Location"))
	}
	if res.Header.Get("Cache-Control") != "no-store" || res.Header.Get("Referrer-Policy") != "no-referrer" {
		t.Errorf("headers = %v", res.Header)
	}
	cookies := res.Cookies()
	if len(cookies) != 1 || !cookies[0].HttpOnly || cookies[0].SameSite != http.SameSiteStrictMode || cookies[0].MaxAge <= 0 || cookies[0].Path != "/" {
		t.Fatalf("cookies = %+v", cookies)
	}
	if !strings.HasPrefix(cookies[0].Name, "matomezu-") || strings.Contains(p.keys[len(p.keys)-1].Hash, cookies[0].Value) {
		t.Errorf("cookie name %q, or the key is kept as it is", cookies[0].Name)
	}
	if code, _ := send(t, "GET", s.URL+"/api/data", "", map[string]string{"Cookie": cookies[0].Name + "=" + cookies[0].Value}); code != 200 {
		t.Errorf("data with the new key = %d", code)
	}
	if got := pair(code).StatusCode; got != 403 {
		t.Errorf("a used code = %d", got)
	}
	old := p.NewCode()
	now = now.Add(pairCodeTTL + time.Second)
	if got := pair(old).StatusCode; got != 403 {
		t.Errorf("an expired code = %d", got)
	}
	if got := pair("").StatusCode; got != 403 {
		t.Errorf("no code = %d", got)
	}
}

// show がブラウザを開くとき、コードはブラウザの URL にだけ載り、どの返事にも載らない（開けなかったときのコードは使えなくなる）
func TestPairCodeIsOnlyInTheBrowserURL(t *testing.T) {
	var opened []string
	var failing bool
	p := NewPairing(nil, nil)
	s := newServerWith(t, Options{URL: "http://screen/", Wait: 20 * time.Millisecond, Pair: p, Open: func(u string) error {
		opened = append(opened, u)
		if failing {
			return http.ErrNotSupported
		}
		return nil
	}})
	send(t, "PUT", s.URL+"/api/books-for-test/b1", `{"book":`+drawing+`,"base":0}`, nil)
	auth := map[string]string{"Authorization": "Bearer secret"}
	for _, c := range []struct{ name, path, body string }{{"show", "/api/ai/show", `{"book":"b1"}`}, {"open", "/api/open", ``}} {
		for _, fail := range []bool{false, true} {
			failing = fail
			opened = nil
			_, body := send(t, "POST", s.URL+c.path, c.body, auth)
			if len(opened) != 1 || !strings.HasPrefix(opened[0], "http://screen/pair?code=") {
				t.Fatalf("%s (fail %v): opened = %v", c.name, fail, opened)
			}
			code := strings.TrimPrefix(opened[0], "http://screen/pair?code=")
			if strings.Contains(body, code) {
				t.Errorf("%s (fail %v): the reply has the code: %s", c.name, fail, body)
			}
			if _, valid := p.Redeem(code); valid == fail {
				t.Errorf("%s (fail %v): the code is valid = %v", c.name, fail, valid)
			}
		}
	}
	// 合言葉が無ければ開かせない
	opened = nil
	if code, _ := send(t, "POST", s.URL+"/api/open", "", map[string]string{"Authorization": "Bearer nope"}); code != 401 || len(opened) != 0 {
		t.Errorf("open without the token = %d, opened %v", code, opened)
	}
}

// 常駐が起こし直されても、保存した鍵のハッシュで通る。鍵は最後に使った順に maxPairKeys 件まで
func TestPairKeysSurviveARestartAndAreLimited(t *testing.T) {
	var saved []PairKey
	p := NewPairing(nil, func(ks []PairKey) error { saved = ks; return nil })
	now := time.Date(2026, 11, 9, 0, 0, 0, 0, time.UTC)
	p.now = func() time.Time { return now }
	first, _ := p.Redeem(p.NewCode())
	if len(saved) != 1 || strings.Contains(saved[0].Hash, first) {
		t.Fatalf("saved = %+v", saved)
	}
	again := NewPairing(saved, nil)
	if !again.Check(first) || again.Check("other") || again.Check("") {
		t.Error("the restarted pairing does not know the key")
	}
	for range maxPairKeys {
		now = now.Add(time.Minute)
		p.Redeem(p.NewCode())
	}
	if len(saved) != maxPairKeys {
		t.Fatalf("keys = %d; want %d", len(saved), maxPairKeys)
	}
	if p.Check(first) {
		t.Error("the oldest key is kept")
	}
	// 使うと最後に使った時刻が新しくなり、残る
	kept, _ := p.Redeem(p.NewCode())
	for range maxPairKeys - 1 {
		now = now.Add(time.Minute)
		p.Check(kept)
		p.Redeem(p.NewCode())
	}
	if !p.Check(kept) {
		t.Error("a key in use was dropped")
	}
}

// ペアを組んでいない画面を開くだけ（画面のファイルは配る。データは配らない）
func TestScreenFilesNeedNoPair(t *testing.T) {
	s := newServer(t, nil)
	res, err := http.Get(s.URL + "/")
	if err != nil {
		t.Fatal(err)
	}
	res.Body.Close()
	if res.StatusCode != 200 {
		t.Errorf("/ = %d", res.StatusCode)
	}
}
