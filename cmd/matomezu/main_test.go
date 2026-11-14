package main

import (
	"encoding/json"
	"errors"
	"net"
	"net/http"
	"net/http/httptest"
	"os"
	"strconv"
	"strings"
	"testing"

	"github.com/umaxyon/matomezu/internal/home"
)

// fakeServer は合言葉 token のときだけ status で答える常駐。呼ばれた数を数える
func fakeServer(t *testing.T, token string, status int, calls *int) *home.Server {
	t.Helper()
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		*calls++
		if r.Header.Get("Authorization") != "Bearer "+token {
			w.WriteHeader(http.StatusUnauthorized)
			return
		}
		w.WriteHeader(status)
		w.Write([]byte(`{"ok":true}`))
	}))
	t.Cleanup(ts.Close)
	return &home.Server{URL: ts.URL + "/", Token: token}
}

// closedServer は、もう誰も待っていないアドレス（立て直す前の常駐）
func closedServer(t *testing.T) *home.Server {
	t.Helper()
	l, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	addr := l.Addr().String()
	l.Close()
	return &home.Server{URL: "http://" + addr + "/", Token: "old"}
}

func TestStaleTokenIsReadAgainOnce(t *testing.T) {
	var calls, reconnects int
	now := fakeServer(t, "new", http.StatusOK, &calls)
	a := &httpAPI{
		s:         &home.Server{URL: now.URL, Token: "old"},
		reconnect: func() (*home.Server, error) { reconnects++; return now, nil },
	}
	out, _, err := a.Post("api/ai/perform", map[string]string{"x": "y"}, nil)
	if err != nil || string(out) != `{"ok":true}` {
		t.Fatalf("got %s, %v", out, err)
	}
	if reconnects != 1 || calls != 2 {
		t.Fatalf("reconnects %d, calls %d", reconnects, calls)
	}
	if _, _, err := a.Get("api/ai/books", nil); err != nil || reconnects != 1 {
		t.Fatalf("the new token is kept: %v, reconnects %d", err, reconnects)
	}
}

func TestStoppedServerIsStartedAgain(t *testing.T) {
	var calls, reconnects int
	now := fakeServer(t, "new", http.StatusOK, &calls)
	a := &httpAPI{
		s:         closedServer(t),
		reconnect: func() (*home.Server, error) { reconnects++; return now, nil },
	}
	if _, _, err := a.Get("api/ai/books", nil); err != nil {
		t.Fatal(err)
	}
	if reconnects != 1 || calls != 1 {
		t.Fatalf("reconnects %d, calls %d", reconnects, calls)
	}
}

func TestRetriesOnlyOnce(t *testing.T) {
	var calls, reconnects int
	s := fakeServer(t, "new", http.StatusOK, &calls)
	wrong := &home.Server{URL: s.URL, Token: "wrong"}
	a := &httpAPI{s: wrong, reconnect: func() (*home.Server, error) { reconnects++; return wrong, nil }}
	if _, _, err := a.Get("api/ai/books", nil); err == nil {
		t.Fatal("still unauthorized after reading again")
	}
	if reconnects != 1 || calls != 2 {
		t.Fatalf("reconnects %d, calls %d", reconnects, calls)
	}
}

func TestOtherFailuresAreNotRetried(t *testing.T) {
	var calls, reconnects int
	s := fakeServer(t, "new", http.StatusInternalServerError, &calls)
	a := &httpAPI{s: s, reconnect: func() (*home.Server, error) { reconnects++; return s, nil }}
	if _, _, err := a.Post("api/ai/perform", nil, nil); err == nil {
		t.Fatal("a 500 is an error")
	}
	if reconnects != 0 || calls != 1 {
		t.Fatalf("reconnects %d, calls %d", reconnects, calls)
	}
}

func TestReconnectFailureIsReported(t *testing.T) {
	a := &httpAPI{
		s:         closedServer(t),
		reconnect: func() (*home.Server, error) { return nil, errors.New("the server did not start") },
	}
	_, _, err := a.Get("api/ai/books", nil)
	if err == nil || !strings.Contains(err.Error(), "the server did not start") {
		t.Fatalf("got %v", err)
	}
}

// 待つアノテーションは、ブックごとの見出しの下に 1 件 1 行（ページ・種類・id・1 行）で書き、中身の全文は書かない。1 行の無い物は種類と id だけ、ページの無い物は no page。待つ物が無ければ何も書かない
func TestWriteAwaiting(t *testing.T) {
	var none strings.Builder
	writeAwaiting(&none, nil)
	if none.Len() != 0 {
		t.Fatalf("no awaiting wrote %q", none.String())
	}
	item := func(book, title, id, page, brief string) awaitingItem {
		p := "null"
		if page != "" {
			p = `"` + page + `"`
		}
		return awaitingItem{Book: book, Title: title, Brief: brief,
			Annotation: json.RawMessage(`{"id":"` + id + `","annotation":"@matomezu/base:note","anchors":["a"],"props":{"text":"long text"},"page":` + p + `,"awaits":true}`)}
	}
	var out strings.Builder
	writeAwaiting(&out, []awaitingItem{
		item("b1", "T", "c1", "p1", "見て… (60 chars)"),
		item("b1", "T", "c2", "p2", ""),
		item("b2", "U", "c3", "", "x"),
	})
	lines := strings.Split(strings.TrimSpace(out.String()), "\n")
	want := []string{
		`- book "T" (b1)`,
		`  - page p1, @matomezu/base:note c1: "見て… (60 chars)"`,
		`  - page p2, @matomezu/base:note c2`,
		`- book "U" (b2)`,
		`  - no page, @matomezu/base:note c3: "x"`,
	}
	if !strings.HasPrefix(lines[0], "matomezu: 3 annotation(s)") || strings.Join(lines[1:], "\n") != strings.Join(want, "\n") {
		t.Fatalf("got\n%s", out.String())
	}
	if strings.Contains(out.String(), "long text") {
		t.Fatalf("the whole text was written: %s", out.String())
	}
}

func TestWriteRemovedSeparatesTheCauses(t *testing.T) {
	var out strings.Builder
	writeRemoved(&out, []removedTicket{
		{Book: "b1", Title: "Plan", Key: "m1", Cause: "limit"},
		{Book: "b1", Title: "Plan", Key: "m2", Cause: "user"},
		{Book: "b2", Title: "Other", Key: "m3", Cause: "other"},
	})
	text := out.String()
	for _, want := range []string{
		"1 change(s) you sent for the user to apply were removed by the mailbox limit",
		"Send them again if they are still needed.",
		"1 change(s) you sent for the user to apply were removed by the user without applying them",
		"Do not send them again unless the user asks.",
		`- book "Plan" (b1), m1`,
		`- book "Plan" (b1), m2`,
	} {
		if !strings.Contains(text, want) {
			t.Errorf("missing %q in:\n%s", want, text)
		}
	}
	if strings.Contains(text, "m3") {
		t.Errorf("an unknown cause must be skipped:\n%s", text)
	}
	out.Reset()
	writeRemoved(&out, nil)
	if out.Len() != 0 {
		t.Errorf("nothing to say, but wrote %q", out.String())
	}
}

// 起こす知らせの宛て先になる AI のプログラムのプロセス id は、入口が伝えた物があればそれ、無ければ親のプロセス
func TestHostProcess(t *testing.T) {
	t.Setenv(hostProcessEnv, "")
	if got := hostProcess(); got != strconv.Itoa(os.Getppid()) {
		t.Fatalf("without the entry's value = %q, want the parent", got)
	}
	t.Setenv(hostProcessEnv, "4242")
	if got := hostProcess(); got != "4242" {
		t.Fatalf("with the entry's value = %q", got)
	}
}
